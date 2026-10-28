// Intermediate guide (src/ir.mjs) -> Polestar `.guide` text. Knows Polestar's
// DSL, not the format the guide came from.

import { onlyText } from "./cond.mjs";
import { goalText, questOf } from "./ir.mjs";

// A text cut for a heading at a word, with "..." where it was cut. Polestar wraps a
// heading, so only a sentence-long one is cut at all.
export function shorten(text, max) {
	const t = String(text);
	if (t.length <= max) return t;
	return t.slice(0, max).replace(/\s+\S*$/, "").replace(/[\s,;:.-]+$/, "") + "...";
}

// Polestar reads " -- " as the start of a comment, allowed on goal lines only.
const free = (text) => String(text).replace(/\s--\s/g, " - ");

export function render(guide, { report, slug, packId, next }) {
	const steps = guide.steps;
	// `along until <label>` ends when the route reaches the step so labelled; a
	// source's along step runs up to and through its target, so it waits for the
	// step after that (`<target>-end` when that one has no label). A source may
	// label several steps alike; Polestar wants each label once, so the second
	// becomes `<label>-2`, and only labels some along step waits for are written.
	const seenLabel = new Map();
	const labelName = steps.map((s) => {
		if (!s.label) return null;
		const n = (seenLabel.get(s.label) || 0) + 1;
		seenLabel.set(s.label, n);
		return n > 1 ? `${s.label}-${n}` : s.label;
	});
	// A label that `alongUntil` or `skipto` names is written as it is.
	// So is one a `when done <label>` (on a step or a jump) asks about.
	const doneOf = (w) => (/^!?done (\S+)$/.exec(w || "") || [])[1];
	const named = new Set(steps.flatMap((s) => [s.alongUntil, ...(s.skipto || []).flatMap((k) => [k.label, doneOf(k.when)]), ...(s.whens || []).map(doneOf)]).filter(Boolean));
	// -1: no `until`; -2: the target is the last step, so the list ends when done.
	const waitsFor = steps.map((s, i) => {
		if (s.alongUntil || !s.completesWith || !s.allAlong) return -1;
		const target = s.completesWith === "next" ? (i + 1 < steps.length ? i + 1 : -1) : steps.findIndex((o, j) => j > i && o.label === s.completesWith);
		if (target < 0) {
			if (s.completesWith !== "open" && s.completesWith !== "next") report.count("along step whose target is only earlier in the guide (kept as an ordinary step)");
			return -1;
		}
		if (target + 1 >= steps.length) return -2;
		if (!labelName[target + 1]) labelName[target + 1] = `${labelName[target] || `step${target + 1}`}-end`;
		return target + 1;
	});
	const waited = new Set(waitsFor.filter((j) => j >= 0));
	let format = 4;
	const out = [];
	// Polestar's `zone` is sticky, but a class-only step's zone does not reach the
	// characters who skipped it, so the next step names its zone again.
	// Without a zone in the header, every step names its own.
	let curMap = guide.zone ? guide.defaultMap : null;
	let conditionalMap = null;
	out.push(`guide ${packId}/${slug}`);
	out.push(`title ${guide.title}`);
	if (guide.faction) out.push(`faction ${guide.faction}`);
	if (guide.classes) out.push(`class ${guide.classes.join(", ")}`);
	if (guide.races.length) out.push(`race ${guide.races.join(", ")}`);
	if (guide.levels) out.push(`levels ${guide.levels}`);
	if (guide.zone) out.push(`zone ${guide.zone}`);
	out.push("coords live");
	if (next.length) out.push(`next ${next.map((n) => `${packId}/${n}`).join(", ")}`);
	out.push(`category ${guide.category || "Leveling"}`);
	if (guide.folder) out.push(`folder ${guide.folder}`);
	out.push("");

	steps.forEach((s, i) => {
		format = Math.max(format, s.format);
		out.push(`step${s.title ? " " + free(shorten(s.title, 120)) : ""}`);
		const only = onlyText(s.only);
		if (only) out.push(`  only ${only}`);
		for (const w of new Set(s.whens || [])) out.push(`  when ${w}`);
		const whenAt = out.length;
		const grind = s.loop.length > 0 && s.goals.some((g) => ["kill", "collect", "interact"].includes(g.kind));
		const maps = [...(grind ? s.loop.map((g) => g.uiMap) : []), ...(s.maps || [])].filter(Boolean);
		if (maps.length) {
			const m = maps[0];
			const conditional = !!only || (s.whens || []).length > 0;
			if (m !== curMap || (conditionalMap !== null && conditionalMap !== m)) {
				out.push(`  zone map ${m}`);
				report.count("zone map set");
			}
			if (conditional) conditionalMap = m;
			else { curMap = m; conditionalMap = null; }
		}
		let along = false;
		// The producer names the label itself, so the step waits for exactly it.
		if (s.alongUntil) { out.push(`  along until ${s.alongUntil}`); along = true; format = Math.max(format, 4); }
		// A step that stays listed until done (RXP `#sticky`) is an along step of its own.
		else if (s.sticky && !s.completesWith && s.allAlong) { out.push("  along"); along = true; }
		else if (s.completesWith && s.allAlong) {
			if (waitsFor[i] >= 0) { out.push(`  along until ${labelName[waitsFor[i]]}`); along = true; format = Math.max(format, 4); }
			else if (s.completesWith === "next" || s.completesWith === "open" || waitsFor[i] === -2) { out.push("  along"); along = true; }
		}
		if (waited.has(i) || (s.label && named.has(s.label))) out.push(`  label ${labelName[i]}`);
		for (const t of s.tips) if (t !== s.title || shorten(t, 120) !== t) out.push(`  tip ${free(t)}`);
		const loopable = s.goals.some((g) => ["kill", "collect", "interact"].includes(g.kind) && !g.at);
		if (s.loop.length >= 2 && loopable) { out.push("  loop"); for (const g of s.loop) out.push(`  goto ${g.x},${g.y}${g.live ? "" : " era"}`); }
		const optional = s.completesWith && !along && !s.goals.every((g) => ["money", "note"].includes(g.kind));
		const isOptional = (g) => (optional || g.optional) && !["note", "task"].includes(g.kind);
		// Polestar passes a step whose goals are all optional at once, unseen: such a
		// step keeps its goals, and the player skips it by hand as in RXP.
		const held = s.goals.filter((g) => g.kind !== "note");
		const qs = new Set(held.map(questOf).filter((q) => q != null));
		const keepAll = !along && held.length > 0 && held.every(isOptional) && !held.every((g) => g.kind === "goto") && qs.size <= 1 && !held.some((g) => g.kind === "turnin");
		if (keepAll) {
			report.count("step of optional goals only -> goals kept (skip by hand)");
			// Kept for a quest the player may not have: shown only while on it.
			const [q] = qs;
			if (q != null && !(s.whens || []).some((w) => w.startsWith("onquest")) && !s.goals.some((g) => g.kind === "accept" && g.quest === q)) out.splice(whenAt, 0, `  when onquest ${q}`);
		}
		for (const k of s.skipto || []) out.push(`  skipto ${k.label} when ${k.when}`);
		for (const g of s.goals) {
			let line = `  ${goalText(g)}`;
			if (g.group) line += g.group === true ? " group" : ` group ${g.group}`;
			if (g.only) line += ` only ${g.only}`;
			if (isOptional(g) && !keepAll) line += " optional";
			if (g.comment) line += ` -- ${g.comment}`;
			out.push(line);
		}
		for (const n of s.notes) out.push(`  note ${free(n)}`);
		out.push("");
	});
	report.count("steps in: " + guide.sourceSteps, 0);
	return { text: out.join("\n"), format, levels: guide.levels, stepsIn: guide.sourceSteps, stepsOut: steps.length };
}
