// RestedXP guide text -> a plain document.
//
// Input is the Lua file the user already has on disk; guides sit in
// RXPGuides.RegisterGuide([[ ... ]]) blocks. Output:
//   { header: {name, next, defaultfor, faction, ...}, steps: [Step] }
//   Step = { cond, tags: [{name, args, cond}], lines: [Line] }
//   Line = { kind: "cmd", name, args, text, cond }   (".accept 363 >> Accept X << Warlock")
//        | { kind: "text", text, cond }              (">>Talk to X")
//        | { kind: "note", text, cond }              ("+Kill things until...")

export function extractGuides(lua) {
	const out = [];
	const re = /RegisterGuide\(\s*\[\[(.*?)\]\]\s*\)/gs;
	let m;
	while ((m = re.exec(lua))) out.push(m[1]);
	return out;
}

// "a >> b << c" -> { main: "a", text: "b", cond: "c" }
function split(raw) {
	// RXP cuts at the first `<<` (spaces optional): all after it is the condition.
	let cond = null;
	let rest = raw;
	const ci = rest.indexOf("<<");
	if (ci >= 0) { cond = rest.slice(ci + 2).trim() || null; rest = rest.slice(0, ci); }
	let text = null;
	const ti = rest.indexOf(">>");
	if (ti >= 0) { text = rest.slice(ti + 2).trim(); rest = rest.slice(0, ti); }
	return { main: rest.trim(), text, cond };
}

export function parseGuide(body) {
	const header = { flags: [] };
	const steps = [];
	let step = null;
	for (const rawLine of body.split(/\r?\n/)) {
		// RXP drops `--` to the end of the line before it parses anything.
		const cut = rawLine.indexOf("--");
		const comment = cut >= 0 ? rawLine.slice(cut + 2).trim() : null;
		const line = (cut >= 0 ? rawLine.slice(0, cut) : rawLine).trim();
		if (!line) continue;
		if (/^step(\s|$)/.test(line)) {
			const m = line.match(/<<\s*(.+)$/);
			step = { cond: m ? m[1].trim() : null, tags: [], lines: [] };
			steps.push(step);
			continue;
		}
		if (!step) {
			if (line.startsWith("<<")) header.faction = line.slice(2).trim();
			else if (line.startsWith("#")) {
				const [, key, val] = line.match(/^#(\w+)\s*(.*)$/) || [];
				if (!key) continue;
				if (["name", "next", "version", "group", "subgroup", "defaultfor", "groupid"].includes(key)) header[key] = val.trim();
				else header.flags.push(key + (val ? " " + val : ""));
			}
			continue;
		}
		if (line.startsWith("#")) {
			const m = line.match(/^#(\w+)\s*(.*)$/);
			if (!m) continue;
			const { main, cond } = split(m[2]);
			step.tags.push({ name: m[1], args: main, cond });
			continue;
		}
		if (line.startsWith(".")) {
			const m = line.match(/^\.(\w+)\s*(.*)$/);
			if (!m) continue;
			let { main, text, cond } = split(m[2]);
			step.lines.push({ kind: "cmd", name: m[1], args: main, text, cond, comment: comment || null });
			continue;
		}
		if (line.startsWith(">>")) {
			const { text, cond } = split(line);
			step.lines.push({ kind: "text", text: text || "", cond });
			continue;
		}
		if (line.startsWith("+")) {
			const { main, cond } = split(line.slice(1));
			step.lines.push({ kind: "note", text: main, cond });
			continue;
		}
	}
	return { header, steps };
}

// "1-6 Invented Vale" -> { levels: "1-6", zone: "Invented Vale" }
export function parseName(name) {
	const m = (name || "").match(/^(\d+)\s*-\s*(\d+)\s+(.*)$/);
	return m ? { levels: `${m[1]}-${m[2]}`, zone: m[3].trim() } : { levels: null, zone: name };
}

// Strip RXP's inline markup: |cRXP_X_..|r colours, |T..|t textures.
export function plain(text) {
	return (text || "")
		.replace(/\|T[^|]*\|t/g, "")
		.replace(/\|cRXP_[A-Z]+_/g, "")
		.replace(/\|c[0-9a-fA-F]{8}/g, "")
		.replace(/\|r/g, "")
		.replace(/::\d+/g, "")
		.replace(/\s+/g, " ")
		.trim();
}
