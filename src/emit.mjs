// Intermediate guide (src/ir.mjs) -> Polestar `.guide` text. Knows Polestar's
// DSL, not the format the guide came from.

import { onlyText } from "./cond.mjs";
import { goalText } from "./ir.mjs";

// Polestar reads " -- " as the start of a comment, allowed on goal lines only.
const free = (text) => String(text).replace(/\s--\s/g, " - ");

export function render(guide, { report, slug, packId, next }) {
	const steps = guide.steps;
	// `along until <label>` waits for the next step so labelled. A source may
	// label several steps alike; Polestar wants each label once, so the second
	// becomes `<label>-2`, and only labels some along step waits for are written.
	const seenLabel = new Map();
	const labelName = steps.map((s) => {
		if (!s.label) return null;
		const n = (seenLabel.get(s.label) || 0) + 1;
		seenLabel.set(s.label, n);
		return n > 1 ? `${s.label}-${n}` : s.label;
	});
	const waitsFor = steps.map((s, i) => {
		if (!s.completesWith || s.completesWith === "next" || !s.allAlong) return -1;
		return steps.findIndex((o, j) => j > i && o.label === s.completesWith);
	});
	const waited = new Set(waitsFor.filter((j) => j >= 0));
	let format = 4;
	const out = [];
	// Polestar's `zone` is sticky, but a class-only step's zone does not reach the
	// characters who skipped it, so the next step names its zone again.
	let curMap = guide.defaultMap;
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
		out.push(`step${s.title ? " " + free(s.title.slice(0, 60)) : ""}`);
		const only = onlyText(s.only);
		if (only) out.push(`  only ${only}`);
		for (const w of s.whens || []) out.push(`  when ${w}`);
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
		// A step that stays listed until done (RXP `#sticky`) is an along step of its own.
		if (s.sticky && !s.completesWith && s.allAlong) { out.push("  along"); along = true; }
		else if (s.completesWith && s.allAlong) {
			if (s.completesWith === "next") { out.push("  along"); along = true; }
			else if (waitsFor[i] >= 0) { out.push(`  along until ${labelName[waitsFor[i]]}`); along = true; format = Math.max(format, 4); }
		}
		if (waited.has(i)) out.push(`  label ${labelName[i]}`);
		for (const t of s.tips) if (t !== s.title) out.push(`  tip ${free(t)}`);
		const loopable = s.goals.some((g) => ["kill", "collect", "interact"].includes(g.kind) && !g.at);
		if (s.loop.length >= 2 && loopable) { out.push("  loop"); for (const g of s.loop) out.push(`  goto ${g.x},${g.y}${g.live ? "" : " era"}`); }
		const optional = s.completesWith && !along && !s.goals.every((g) => ["money", "note"].includes(g.kind));
		for (const g of s.goals) {
			let line = `  ${goalText(g)}`;
			if (g.group) line += g.group === true ? " group" : ` group ${g.group}`;
			if (g.only) line += ` only ${g.only}`;
			if ((optional || g.optional) && !["note", "task"].includes(g.kind)) line += " optional";
			if (g.comment) line += ` -- ${g.comment}`;
			out.push(line);
		}
		for (const n of s.notes) out.push(`  note ${free(n)}`);
		out.push("");
	});
	report.count("steps in: " + guide.sourceSteps, 0);
	return { text: out.join("\n"), format, levels: guide.levels, stepsIn: guide.sourceSteps, stepsOut: steps.length };
}
