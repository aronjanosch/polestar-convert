// Intermediate guide (src/ir.mjs) -> Polestar `.guide` text. Knows Polestar's
// DSL, not the format the guide came from.

import { onlyText } from "./cond.mjs";
import { goalText } from "./ir.mjs";

export function render(guide, { report, slug, packId, next }) {
	const steps = guide.steps;
	// `along until <label>`: only when the label sits on a later step we keep.
	const labels = new Map();
	steps.forEach((s, i) => { if (s.label) labels.set(s.label, i); });
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
	if (next) out.push(`next ${packId}/${next}`);
	out.push("category Leveling");
	out.push("");

	steps.forEach((s, i) => {
		format = Math.max(format, s.format);
		out.push(`step${s.title ? " " + s.title.slice(0, 60) : ""}`);
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
		if (s.completesWith && s.allAlong) {
			if (s.completesWith === "next") { out.push("  along"); along = true; }
			else if (labels.has(s.completesWith) && labels.get(s.completesWith) > i) { out.push(`  along until ${s.completesWith}`); along = true; format = Math.max(format, 4); }
		}
		if (s.label && steps.some((o, j) => j < i && o.completesWith === s.label && o.allAlong)) out.push(`  label ${s.label}`);
		for (const t of s.tips.slice(0, 2)) if (t !== s.title) out.push(`  tip ${t}`);
		const loopable = s.goals.some((g) => ["kill", "collect", "interact"].includes(g.kind) && !g.at);
		if (s.loop.length >= 2 && loopable) { out.push("  loop"); for (const g of s.loop) out.push(`  goto ${g.x},${g.y}${g.live ? "" : " era"}`); }
		const optional = s.completesWith && !along && !s.goals.every((g) => ["money", "note"].includes(g.kind));
		for (const g of s.goals) {
			let line = `  ${goalText(g)}`;
			if (g.only) line += ` only ${g.only}`;
			if (optional && !["note", "task"].includes(g.kind)) line += " optional";
			if (g.comment) line += ` -- ${g.comment}`;
			out.push(line);
		}
		for (const n of s.notes.slice(0, 2)) out.push(`  note ${n}`);
		out.push("");
	});
	report.count("steps in: " + guide.sourceSteps, 0);
	return { text: out.join("\n"), format, stepsIn: guide.sourceSteps, stepsOut: steps.length };
}
