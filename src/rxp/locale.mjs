// A translated RXP guide laid over the English one. RXP ships hand-translated
// copies (same steps, quest ids and coordinates; only the words differ), so the
// result keeps every English decision input and takes only the display words.

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
