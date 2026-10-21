// A translated RXP guide laid over the English one. RXP ships hand-translated
// copies (same steps, quest ids and coordinates; only the words differ), so the
// result keeps every English decision input and takes only the display words.

import { Report } from "../ir.mjs";
import { expandIncludes } from "./chain.mjs";
import { pairRendered } from "../i18n/pair.mjs";

const NAMED = new Set(["target", "mob", "unitscan"]);

// The lines of a step pair when counts match and each pair is the same command.
function paired(en, tr) {
	if (en.lines.length !== tr.lines.length) return false;
	return en.lines.every((a, i) => {
		const b = tr.lines[i];
		if (a.kind !== b.kind) return false;
		if (a.kind !== "cmd") return true;
		if (a.name !== b.name) return false;
		return NAMED.has(a.name) || a.args === b.args;
	});
}

export function alignGuide(en, tr, report) {
	const guide = structuredClone(en);
	const names = new Map();
	if (tr.header.name) guide.header.name = tr.header.name;
	const display = (h) => h.flags.findIndex((f) => /^displayname(\s|$)/.test(f));
	const di = display(guide.header), ti = display(tr.header);
	if (di >= 0 && ti >= 0) guide.header.flags[di] = tr.header.flags[ti];
	guide.steps.forEach((step, i) => {
		const other = tr.steps[i];
		if (!paired(step, other)) { report.count("locale: step not paired"); return; }
		step.lines.forEach((line, j) => {
			const b = other.lines[j];
			if (line.kind === "cmd" && NAMED.has(line.name) && line.args && b.args) names.set(line.args, b.args);
			if (typeof line.text === "string" && typeof b.text === "string" && b.text) line.text = b.text;
		});
	});
	return { guide, names };
}

// The guides of one file by index; null where nothing pairs.
export function alignFile(enGuides, trGuides, report) {
	return enGuides.map((en, i) => {
		const tr = trGuides[i];
		if (!tr || tr.steps.length !== en.steps.length) { report.count("locale: guide not paired"); return null; }
		return alignGuide(en, tr, report);
	});
}

// One language over a run. `rawByFile`: the English guides of each file as
// parsed (before #include); `trByFile`: the translated ones, [] where a file has
// none. `chosen`: [{ at, slug, text }], `at` an index into rawByFile.flat() and
// `text` the English render. `render(guide, item)` converts the translated guide
// with the English one's options. Returns the texts and names paired and one
// Report per slug.
export function pairLanguage(rawByFile, trByFile, chosen, render) {
	const raw = rawByFile.flat();
	const own = raw.map(() => new Report());
	const aligned = [];
	rawByFile.forEach((en, f) => en.forEach((g, i) => {
		const tr = trByFile[f]?.[i];
		aligned.push(alignFile([g], tr ? [tr] : [], own[aligned.length])[0]);
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
