// RestedXP's imported guides. Guides imported in the game (bought ones come this
// way) never appear as `.lua` files: the addon unpacks the import string itself and
// keeps each guide in the account's SavedVariables (WTF/Account/<account>/
// SavedVariables/RXPGuides.lua, variable RXPDB, each profile's `guides`), the guide's
// lines DEFLATE-packed with a comment line before them. This module reads that file
// the way the addon does on load (GuideLoader.lua): unpack and take what the addon
// takes, nothing else.

// The string escapes the game's SavedVariables writer can produce (Lua 5.1 short
// strings): named ones, quote and backslash; every other byte comes as itself or
// as `\ddd`. A quoted string does not span lines.
const NAMED = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, 92: 92, 34: 34, 39: 39 };
const isSpace = (b) => b === 32 || b === 9 || b === 10 || b === 13;
const isDigit = (b) => b >= 48 && b <= 57;
const isIdent = (b) => isDigit(b) || (b >= 97 && b <= 122) || (b >= 65 && b <= 90) || b === 95;
// Bytes as the game's own locale bytes: keys and numbers are ASCII, guide text is
// UTF-8 inside the packed string, so no byte is re-read as text here.
const latin1 = new TextDecoder("latin1");

// One SavedVariables file's top-level variables (`RXPData = { … }`, `RXPDB = { … }`,
// …): { RXPDB: { profiles: { … } } }. A table is an object of its keys, positional
// items numbered from 1; a string is its bytes. Throws on a form the game does not
// write. Browser and Node alike: bytes in, no file access.
export function parseSavedVariables(bytes) {
	const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let i = 0;
	const ws = () => { while (i < b.length && isSpace(b[i])) i++; };
	const take = (chars) => {
		ws();
		for (const c of chars) { if (b[i] !== c.charCodeAt(0)) return false; i++; ws(); }
		return true;
	};
	const ident = () => {
		ws();
		const start = i;
		while (i < b.length && isIdent(b[i])) i++;
		return start < i ? latin1.decode(b.subarray(start, i)) : null;
	};
	// `"…"` as its bytes, escapes read as Lua reads them.
	const string = () => {
		ws();
		if (b[i] !== 34) throw new Error(`cannot read the SavedVariables file at ${i}`);
		i++;
		const out = [];
		for (;;) {
			if (i >= b.length || b[i] === 10 || b[i] === 13) throw new Error("a SavedVariables string ends early");
			const c = b[i];
			if (c === 34) { i++; return new Uint8Array(out); }
			i++;
			if (c !== 92) { out.push(c); continue; }
			if (isDigit(b[i])) {
				let n = 0, k = 0;
				while (k < 3 && isDigit(b[i])) { n = n * 10 + (b[i] - 48); i++; k++; }
				if (n > 255) throw new Error("a SavedVariables escape names no byte");
				out.push(n);
			} else {
				const named = NAMED[b[i]];
				if (!named) throw new Error("a SavedVariables string has an unknown escape");
				i++;
				out.push(named);
			}
		}
	};
	const number = () => {
		ws();
		const start = i;
		if (b[i] === 45) i++;
		while (isDigit(b[i])) i++;
		if (b[i] === 46) { i++; while (isDigit(b[i])) i++; }
		if (b[i] === 101 || b[i] === 69) { i++; if (b[i] === 43 || b[i] === 45) i++; while (isDigit(b[i])) i++; }
		const n = Number(latin1.decode(b.subarray(start, i)));
		if (Number.isNaN(n)) throw new Error(`cannot read the SavedVariables file at ${start}`);
		return n;
	};
	const value = () => {
		ws();
		if (b[i] === 34) return string();
		if (b[i] === 123) { i++; return table(); }
		if (isDigit(b[i]) || b[i] === 45) return number();
		const word = ident();
		if (word === "true") return true;
		if (word === "false") return false;
		if (word === "nil") return null;
		throw new Error(`cannot read the SavedVariables file at ${i}`);
	};
	// A table's entries: `["key"] = value`, `key = value` or a positional value,
	// commas between them, nothing else written.
	const table = () => {
		const out = {};
		let n = 0;
		for (;;) {
			ws();
			if (i >= b.length) throw new Error("a SavedVariables table ends early");
			if (b[i] === 125) { i++; return out; }
			let key = null;
			if (b[i] === 91) { i++; key = latin1.decode(string()); if (!take("]=")) throw new Error("a SavedVariables key is written wrong"); }
			else {
				const save = i;
				const word = ident();
				ws();
				if (word && b[i] === 61) { i++; key = word; } else i = save;
			}
			out[key ?? String(++n)] = value();
			take(","); // the comma after an entry
		}
	};
	const vars = {};
	for (;;) {
		ws();
		if (i >= b.length) return vars;
		const name = ident();
		if (!name || !take("=")) throw new Error(`cannot read the SavedVariables file at ${i}`);
		vars[name] = value();
	}
}

// Raw DEFLATE (no zlib header), as RXP packs its cached guides and unpacks them on
// load: the browser and Node both run it as a stream, so the adapter needs no
// dependency and no `node:zlib`.
async function inflate(bytes) {
	const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

// The guides of one SavedVariables file, as `RegisterGuide([[ … ]])` blocks (the
// shape of the addon's own `Guides/Import.lua`), or null for an entry the addon
// would drop too. RXP's check on load: the unpacked text starts with `--<number>`
// (the account hash its bit library can hand out negative).
async function savedGuide(entry, report) {
	const packed = entry && entry.groupOrContent;
	if (!(packed instanceof Uint8Array)) { report.count("imported guide in a form the converter does not read (left out)"); return null; }
	let text;
	try {
		text = new TextDecoder().decode(await inflate(packed));
	} catch {
		text = null;
	}
	if (!text || !/^---?\d+\r?\n/.test(text)) {
		report.count("imported guide not decodable (left out)");
		report.note(null, 0, "imported guide not decodable: the SavedVariables entry unpacks to nothing this reader takes");
		return null;
	}
	return text;
}

// The file of one entry of `files` (the RXPGuides.lua of each account, as bytes)
// -> its guide files: [{ path, text }], one per imported guide, in the file's order,
// one copy of each. Nothing in the file -> []. What cannot be unpacked is counted.
export async function savedGuides(files, report) {
	const out = [], seen = new Set();
	for (const bytes of files || []) {
		const vars = parseSavedVariables(bytes);
		for (const profile of Object.values(vars?.RXPDB?.profiles ?? {})) {
			for (const entry of Object.values(profile?.guides ?? {})) {
				const text = await savedGuide(entry, report);
				if (text == null) continue;
				if (seen.has(text)) { report.count("imported guide held twice (one copy kept)"); continue; }
				seen.add(text);
				report.count("imported guide read (SavedVariables)");
				out.push({ path: "SavedVariables/RXPGuides.lua", text: `RXPGuides.RegisterGuide([[${text}\n]])` });
			}
		}
	}
	return out;
}
