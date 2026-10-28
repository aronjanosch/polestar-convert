// A translated RXP guide laid over the English one. RXP ships hand-translated
// copies (same steps, quest ids and coordinates; only the words differ), so the
// result keeps every English decision input and takes only the display words.

import { Report } from "../ir.mjs";
import { expandIncludes } from "./chain.mjs";
import { pairRendered } from "../i18n/pair.mjs";

const NAMED = new Set(["target", "mob", "unitscan"]);

// A step's signature: its line kinds and commands. Two steps whose lines pair
// (same count, same commands; name commands by position) have equal ones.
const signature = (step) => step.lines.map((l) => l.kind !== "cmd" ? l.kind : NAMED.has(l.name) ? `${l.name}` : `${l.name} ${l.args}`).join("\n");

// For each English step the index of its translated step, or -1: the longest
// common subsequence of signatures, so a step added or dropped on one side
// shifts nothing else.
function matchSteps(en, tr) {
	const a = en.steps.map(signature), b = tr.steps.map(signature);
	const w = b.length + 1;
	const dp = new Uint16Array((a.length + 1) * w);
	for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
		dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
	}
	const match = a.map(() => -1);
	for (let i = 0, j = 0; i < a.length && j < b.length;) {
		if (a[i] === b[j]) match[i++] = j++;
		else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) i++;
		else j++;
	}
	return match;
}

// RXP keeps the English with this marker where its translator has not been yet.
const UNTRANSLATED = "(NOT TRANSLATED IN :";

// The translated steps of a guide pair by `matchSteps`, or null when fewer than
// half of the English steps find theirs.
function pairSteps(en, tr) {
	const match = tr ? matchSteps(en, tr) : [];
	return match.filter((j) => j >= 0).length * 2 < en.steps.length ? null : match;
}

// The English guide with the translated words. `tr` null: no translated guide,
// every line from `memory` (English line text -> translated) where it has one.
export function alignGuide(en, tr, report, match = tr ? matchSteps(en, tr) : [], memory = new Map()) {
	const guide = structuredClone(en);
	const names = new Map();
	guide.header.en = en.header;
	if (tr?.header.name) guide.header.name = tr.header.name;
	const display = (h) => h.flags.findIndex((f) => /^displayname(\s|$)/.test(f));
	const di = display(guide.header), ti = tr ? display(tr.header) : -1;
	if (di >= 0 && ti >= 0) guide.header.flags[di] = tr.header.flags[ti];
	guide.steps.forEach((step, i) => {
		const other = tr && match[i] >= 0 ? tr.steps[match[i]] : null;
		if (tr && !other) report.count("locale: step not paired");
		step.lines.forEach((line, j) => {
			const b = other?.lines[j];
			if (b && line.kind === "cmd" && NAMED.has(line.name) && line.args && b.args) names.set(line.args, b.args);
			if (typeof line.text !== "string") return;
			let own = typeof b?.text === "string" && b.text ? b.text : null;
			if (own?.includes(UNTRANSLATED)) { report.count("locale: not translated in source"); own = null; }
			if (own === line.text) own = null;
			const text = own ?? memory.get(line.text);
			if (text) { line.en = line.text; line.text = text; }
		});
	});
	return { guide, names };
}

// The guides of one file by index; a guide that does not pair takes its words
// from `memory` alone, or is null without one.
export function alignFile(enGuides, trGuides, report, memory) {
	return enGuides.map((en, i) => {
		const tr = trGuides[i];
		const match = pairSteps(en, tr);
		if (match) return alignGuide(en, tr, report, match, memory);
		report.count("locale: guide not paired");
		return memory?.size ? alignGuide(en, null, report, [], memory) : null;
	});
}

// English line text -> translated, from the guides of one file in both
// languages, added to `memory` (the first translation of a text stays): a line
// a guide's own translation lacks may be one RXP translated in another guide.
export function lineMemory(enGuides, trGuides, memory = new Map()) {
	enGuides.forEach((en, i) => {
		const tr = trGuides[i];
		const match = pairSteps(en, tr);
		if (match) en.steps.forEach((step, k) => {
			if (match[k] < 0) return;
			step.lines.forEach((line, j) => {
				const t = tr.steps[match[k]].lines[j].text;
				if (line.text && t && t !== line.text && !t.includes(UNTRANSLATED) && !memory.has(line.text)) memory.set(line.text, t);
			});
		});
	});
	return memory;
}

// One language over a run. `rawByFile`: the English guides of each file as
// parsed (before #include); `trByFile`: the translated ones, [] where a file has
// none. `chosen`: [{ at, slug, text }], `at` an index into rawByFile.flat() and
// `text` the English render. `render(guide, item)` converts the translated guide
// with the English one's options. `memory`: line texts from other guides (lineMemory)
// for the lines and guides without their own translation. Returns the texts and
// names paired and one Report per slug.
export function pairLanguage(rawByFile, trByFile, chosen, render, memory) {
	const raw = rawByFile.flat();
	const own = raw.map(() => new Report());
	const aligned = [];
	rawByFile.forEach((en, f) => en.forEach((g, i) => {
		const tr = trByFile[f]?.[i];
		aligned.push(alignFile([g], tr ? [tr] : [], own[aligned.length], memory)[0]);
	}));
	const names = new Map();
	for (const a of aligned) if (a) for (const [k, v] of a.names) if (!names.has(k)) names.set(k, v);
	// #include finds its guide by the English group and name; the result takes the translated header.
	const expanded = expandIncludes(raw.map((g, i) => ({ ...(aligned[i]?.guide ?? g), header: g.header })), new Report());
	const pairs = new Map();
	const guides = new Map();
	for (const item of chosen) {
		const report = own[item.at];
		guides.set(item.slug, report);
		if (!aligned[item.at]) continue;
		const guide = { ...expanded[item.at], header: aligned[item.at].guide.header };
		pairRendered(item.text, render(guide, item), report, pairs);
	}
	return { pairs, names, guides };
}
