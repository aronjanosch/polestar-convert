// Zygor's guide files are Lua: `ZygorGuidesViewer:RegisterGuide("<name>", {<header>}, [[<body>]])`.
// This cuts the files into guides and the bodies into steps of lines; it carries no
// guide content of its own and does not evaluate any Lua.

const VERBS = new Set(("talk talknpcs accept turnin turninany kill collect expcollect goto use click clicknpc buy trash "
	+ "ding fpath fly home hearth bank learn learnspell equip skill confirm openskill findcity path map cast").split(" "));

// Reads a Lua quoted string at s[i]; returns [value, index after it].
function readString(s, i) {
	const q = s[i++];
	let out = "";
	while (i < s.length && s[i] !== q) {
		if (s[i] === "\\" && i + 1 < s.length) { out += s[i + 1]; i += 2; }
		else out += s[i++];
	}
	return [out, i + 1];
}

// Index after the quoted string starting at s[i] (the text is kept as it is).
function skipString(s, i) {
	return readString(s, i)[1];
}

// Splits `key=value, key=value` of a header into raw value text. Values are not
// evaluated; commas inside strings, brackets and `function ... end` do not split.
function headerFields(text) {
	const out = {};
	let i = 0;
	while (i < text.length) {
		const m = /^[\s,]*([A-Za-z_][A-Za-z_0-9]*)\s*=\s*/.exec(text.slice(i));
		if (!m) break;
		const key = m[1];
		i += m[0].length;
		const start = i;
		let depth = 0;
		while (i < text.length) {
			const c = text[i];
			if (c === '"' || c === "'") { i = skipString(text, i); continue; }
			if ("({[".includes(c)) depth++;
			else if (")}]".includes(c)) depth--;
			else if (/[A-Za-z_]/.test(c)) {
				const w = /^[A-Za-z_][A-Za-z_0-9]*/.exec(text.slice(i))[0];
				if (w === "function" || w === "if" || w === "for" || w === "while") depth++;
				else if (w === "end") depth--;
				i += w.length;
				continue;
			} else if (c === "," && depth <= 0) break;
			i++;
		}
		out[key] = text.slice(start, i).trim();
	}
	return out;
}

// A raw header value that is a quoted string becomes its text; others stay raw.
function unquote(raw) {
	if (raw === undefined) return undefined;
	if (/^["']/.test(raw)) {
		const [v, end] = readString(raw, 0);
		if (end === raw.length) return v;
	}
	return raw;
}

// Every RegisterGuide in a Lua file (placeholders are not guides).
export function extractGuides(lua) {
	const s = String(lua).replace(/\r/g, "");
	const guides = [];
	const re = /RegisterGuide\(\s*"/g;
	let m;
	while ((m = re.exec(s))) {
		const [name, afterName] = readString(s, m.index + m[0].length - 1);
		const open = s.indexOf("{", afterName);
		if (open < 0) break;
		let i = open + 1;
		let depth = 1;
		while (i < s.length && depth > 0) {
			const c = s[i];
			if (c === '"' || c === "'") { i = skipString(s, i); continue; }
			if (c === "{") depth++;
			else if (c === "}") depth--;
			i++;
		}
		const headerText = s.slice(open + 1, i - 1);
		const bodyStart = s.indexOf("[[", i);
		if (bodyStart < 0) break;
		const bodyEnd = s.indexOf("]]", bodyStart + 2);
		if (bodyEnd < 0) break;
		const f = headerFields(headerText);
		const header = {};
		for (const k of ["next", "hideif", "condition_visible", "condition_suggested", "description"]) {
			if (f[k] !== undefined) header[k] = unquote(f[k]);
		}
		if (f.startlevel !== undefined && !Number.isNaN(Number(f.startlevel))) header.startlevel = Number(f.startlevel);
		guides.push({ name, header, body: s.slice(bodyStart + 2, bodyEnd).replace(/^\n/, "") });
		re.lastIndex = bodyEnd + 2;
	}
	return guides;
}

// `|name args` chunks of a line; tabs count as spaces. Returns the chunks as mods.
function modsOf(chunks) {
	return chunks.map((c) => {
		const t = c.trim();
		const sp = t.search(/\s/);
		return sp < 0 ? { name: t, args: "" } : { name: t.slice(0, sp), args: t.slice(sp).trim() };
	}).filter((m) => m.name);
}

function parseLine(raw) {
	const flat = raw.replace(/\t/g, " ");
	const chunks = flat.split(/ *\|/);
	// A line starting with `|` has an empty first chunk, so the split gives "" first.
	const first = chunks.shift().trim();
	const mods = modsOf(chunks);
	const m = /^(\S+)(?:\s+([\s\S]*))?$/.exec(first);
	if (m && VERBS.has(m[1])) return { verb: m[1], text: (m[2] || "").trim(), mods, raw };
	return { verb: null, text: first, mods, raw };
}

// Body text to steps. `stickystart` / `stickystop` come at the end of the step
// before the one they belong to, so they wait for the next kept step.
export function parseBody(body) {
	const steps = [];
	let cur = null;
	let pendStarts = [];
	let pendStops = [];
	const finish = () => {
		if (!cur) return;
		if (cur.lines.length || cur.label !== null) {
			cur.no = steps.length + 1;
			steps.push(cur);
		} else {
			// Zygor ignores a step without lines; what it was to start or stop still holds.
			pendStarts = cur.starts.concat(pendStarts);
			pendStops = cur.stops.concat(pendStops);
		}
		cur = null;
	};
	for (const rawLine of String(body).replace(/\r/g, "").split("\n")) {
		const line = rawLine.trim();
		if (!line) continue;
		if (line === "step") {
			finish();
			cur = { no: 0, label: null, starts: pendStarts, stops: pendStops, lines: [] };
			pendStarts = [];
			pendStops = [];
			continue;
		}
		if (!cur) continue; // `defaultfor` and the like before the first step
		let m;
		if ((m = /^stickystart\s+"([^"]*)"/.exec(line))) { pendStarts.push(m[1]); continue; }
		if ((m = /^stickystop\s+"([^"]*)"/.exec(line))) { pendStops.push(m[1]); continue; }
		if ((m = /^label\s+"([^"]*)"/.exec(line))) { cur.label = m[1]; continue; }
		if (line.startsWith("'") && cur.lines.length) {
			const prev = cur.lines[cur.lines.length - 1];
			prev.mods.push(...modsOf(line.slice(1).replace(/\t/g, " ").split(/ *\|/)));
			prev.raw += "\n" + line;
			continue;
		}
		cur.lines.push(parseLine(line));
	}
	finish();
	return steps;
}

// `Name##id` of a text, several comma-separated; a trailing `+` and a leading verb
// or count are not part of the name.
export function refs(text) {
	const out = [];
	const re = /([^,|#]+?)##(\d+)\+?/g;
	let m;
	while ((m = re.exec(String(text)))) {
		let name = m[1].trim();
		const w = /^(\S+)\s+(\S[\s\S]*)$/.exec(name);
		if (w && VERBS.has(w[1])) name = w[2];
		name = name.replace(/^\d+\s+/, "");
		out.push({ name, id: Number(m[2]) });
	}
	return out;
}
