// Fill the empty lines of a pack's locale files from paired texts.
// The files are the ones `i18n guides sync` writes; a line that already holds
// text is never changed, and a line that does not pair stays "".

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { OWN } from "./own.mjs";

// As the clone's tools/lib/i18n/files.js writes a Lua string.
function luaString(s) {
	let out = '"';
	for (const ch of String(s)) {
		if (ch === "\\") out += "\\\\";
		else if (ch === '"') out += '\\"';
		else if (ch === "\n") out += "\\n";
		else if (ch === "\r") out += "\\r";
		else if (ch === "\t") out += "\\t";
		else if (ch.charCodeAt(0) < 32) out += `\\${String(ch.charCodeAt(0)).padStart(3, "0")}`;
		else out += ch;
	}
	return `${out}"`;
}

// The text inside Lua quotes: \\ \" \n \r \t and \ddd (a UTF-8 byte).
function decode(body) {
	const bytes = [];
	for (let i = 0; i < body.length; i++) {
		if (body[i] !== "\\") { bytes.push(...Buffer.from(String.fromCodePoint(body.codePointAt(i)))); if (body.codePointAt(i) > 0xffff) i++; continue; }
		const d = /^\d{1,3}/.exec(body.slice(i + 1));
		if (d) { bytes.push(Number(d[0])); i += d[0].length; continue; }
		const c = body[++i];
		bytes.push(...Buffer.from(c === "n" ? "\n" : c === "r" ? "\r" : c === "t" ? "\t" : c));
	}
	return Buffer.from(bytes).toString("utf8");
}

const LINE = /^(\t\[)"((?:[^"\\]|\\.)*)"(\] = )"((?:[^"\\]|\\.)*)"(,.*)$/;
const TOKEN = /\{([^{}:]+:\d+)\}/g;
const UNNAMED = " (no name in this language: may be words)";

// { "npc:1": "Bob" } from the token comment line above a key.
function readTokens(line) {
	const tokens = new Map();
	for (const part of line.replace(/^\t-- /, "").split(" · ")) {
		const m = /^\{([^{}]+)\} (.*)$/.exec(part);
		if (m) tokens.set(m[1], m[2].endsWith(UNNAMED) ? m[2].slice(0, -UNNAMED.length) : m[2]);
	}
	return tokens;
}

// The translation with each token's name swapped for the token, or null.
// Longest name first across all tokens, through placeholders, so a name
// inside a token (or inside another name) is never matched twice.
function putTokens(translated, key, tokens, namesOf) {
	const need = new Map();
	for (const m of key.matchAll(TOKEN)) need.set(m[1], (need.get(m[1]) ?? 0) + 1);
	const names = [];
	for (const tok of need.keys()) {
		const list = namesOf(tok, tokens.get(tok));
		if (!list || !list.length) return { missing: true };
		for (const n of list) if (n) names.push({ tok, name: n });
	}
	names.sort((a, b) => b.name.length - a.name.length);
	const seen = new Map();
	let text = translated;
	names.forEach(({ tok, name }, i) => {
		const parts = text.split(name);
		if (parts.length === 1) return;
		seen.set(tok, (seen.get(tok) ?? 0) + parts.length - 1);
		text = parts.join(`${i}`);
	});
	for (const [tok, n] of need) if (seen.get(tok) !== n) return { missing: true };
	return { text: text.replace(/(\d+)/g, (_, i) => `{${names[i].tok}}`) };
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The compiler may make a token from a short spelling ("Keldric") while the
// comment holds the full name, so the rebuilt English pairs nothing. Then the
// key is a pattern, each token a wildcard; it counts only when one text fits.
// The English texts are bucketed by their start, built per prefix length.
function byPattern(pairs) {
	const buckets = new Map();
	const bucket = (n) => {
		if (!buckets.has(n)) {
			const b = new Map();
			for (const en of pairs.keys()) {
				const k = en.slice(0, n);
				if (!b.has(k)) b.set(k, []);
				b.get(k).push(en);
			}
			buckets.set(n, b);
		}
		return buckets.get(n);
	};
	// A wildcard stands for a spelling of one name: within its line and no
	// longer than the comment's name, so it never swallows a sentence.
	return (key, tokens) => {
		const parts = key.split(TOKEN);
		if (parts.length < 3) return undefined;
		const head = parts[0].slice(0, 12);
		const re = new RegExp(`^${parts.map((p, i) => i % 2 === 0 ? escape(p) : `([^\\n]{1,${tokens.get(p)?.length || 200}}?)`).join("")}$`);
		const found = (head ? bucket(head.length).get(head) ?? [] : [...pairs.keys()]).filter((en) => re.test(en));
		return found.length === 1 ? pairs.get(found[0]) : undefined;
	};
}

// A key's shape: each token by its kind only ("Talk to {npc}"), and the tokens in order.
function shapeOf(key) {
	const tokens = [];
	const shape = key.replace(TOKEN, (_, tok) => { tokens.push(tok); return `{${tok.split(":")[0]}}`; });
	return { shape, tokens };
}

// A translated key taught to `shapes` (shape -> Map<translation with each token as
// its place {#n}, count>): one line, each token once in the key and in the translation.
function learn(shapes, key, translated) {
	if (key.includes("\n")) return;
	const { shape, tokens } = shapeOf(key);
	if (new Set(tokens).size !== tokens.length) return;
	const used = [];
	const text = translated.replace(TOKEN, (all, tok) => { used.push(tok); return `{#${tokens.indexOf(tok)}}`; });
	if (used.length !== tokens.length || new Set(used).size !== used.length || !used.every((t) => tokens.includes(t))) return;
	if (!shapes.has(shape)) shapes.set(shape, new Map());
	const seen = shapes.get(shape);
	seen.set(text, (seen.get(text) ?? 0) + 1);
}

// Shape -> its most frequent translation, from the locale files' filled lines and
// `own` (the converter's own sentences: shape -> translation, which always wins).
export function shapesOf(fileTexts, own = {}) {
	const shapes = new Map();
	for (const text of fileTexts) for (const line of text.split("\n")) {
		const m = LINE.exec(line);
		if (m && m[4] !== "") learn(shapes, decode(m[2]), decode(m[4]));
	}
	const best = new Map([...shapes].map(([shape, seen]) => [shape, [...seen].reduce((a, b) => (b[1] > a[1] ? b : a))[0]]));
	for (const [shape, text] of Object.entries(own)) best.set(shape, text);
	return best;
}

// [[words, token]] from a "plural, as words" line: "Wolfs = {npc:1} Wolf · ...".
function readPlurals(line) {
	return line.replace(/^\t-- plural, as words: /, "").split(" · ").map((part) => /^(.*) = \{([^{}]+)\} /.exec(part)?.slice(1)).filter(Boolean);
}

// A list of names of one kind: "{npc:1}, {npc:2} and {npc:3}".
const LIST = /\{(\w+):\d+\}(?:, \{\1:\d+\})*,? (and|or) \{\1:\d+\}/g;

// One line of a key by the translation of its shape, its tokens put back; or
// undefined. A name in the plural, as words, counts as its singular's token,
// which the translation may hold. A line of names alone is its own translation.
// With `lang` (own.mjs: [separator, last word] for "and" and "or"), a list of
// names stands for one name when its own shape has no translation.
function byShape(shapes, key, plurals, lang) {
	for (const [words, tok] of [...plurals].sort((a, b) => b[0].length - a[0].length)) key = key.split(words).join(`{${tok}}`);
	const of = (k) => {
		const { shape, tokens } = shapeOf(k);
		if (!/[A-Za-z]/.test(shape.replace(/\{\w+\}/g, ""))) return k;
		return shapes.get(shape)?.replace(/\{#(\d+)\}/g, (_, i) => `{${tokens[i]}}`);
	};
	const whole = of(key);
	if (whole || !lang) return whole;
	const joined = new Map();
	const short = key.replace(LIST, (all, kind, word) => {
		const names = all.match(TOKEN);
		const [sep, last] = lang[word];
		joined.set(names[0], `${names.slice(0, -1).join(sep)}${last}${names.at(-1)}`);
		return names[0];
	});
	if (!joined.size || [...joined.keys()].some((t) => short.split(t).length !== 2)) return undefined;
	return of(short)?.replace(TOKEN, (all) => joined.get(all) ?? all);
}

// `shapes` (shapesOf): for a key or its lines that pair with nothing, the
// translation of a key of the same shape; `lang`: the language's own words
// (own.mjs), for lists of names and a line of several sentences. A key of several
// lines is filled line by line, as far as its lines go.
export function fillText(fileText, pairs, namesOf, { shapes = new Map(), lang } = {}) {
	const fuzzy = byPattern(pairs);
	const counts = { translated: 0, "partly translated": 0, kept: 0, "no pair": 0, "name not found": 0 };
	const examples = [];
	let tokens = new Map(), plurals = [];
	let step = null;
	const out = fileText.split("\n").map((line) => {
		const at = /^\t-- (?:Step (\d+)|Guide)\b/.exec(line);
		if (at) step = at[1] ? Number(at[1]) : null;
		if (/^\t-- \{/.test(line)) { tokens = readTokens(line); return line; }
		if (/^\t-- plural, as words: /.test(line)) { plurals = readPlurals(line); return line; }
		const m = LINE.exec(line);
		if (!m) return line;
		const [, pre, rawKey, mid, rawValue, post] = m;
		const mine = tokens, theirs = plurals;
		tokens = new Map(); plurals = [];
		if (rawValue !== "") { counts.kept++; return line; }
		const key = decode(rawKey);
		const english = (k) => k.replace(TOKEN, (all, tok) => mine.get(tok) ?? all);
		// The key's own pair, else its shape's; null when a name was not found.
		const one = (k) => {
			const tr = pairs.get(english(k)) ?? fuzzy(k, mine);
			const done = tr ? putTokens(tr, k, mine, namesOf) : { missing: false };
			return done.text ?? byShape(shapes, k, theirs, lang) ?? (done.missing ? null : undefined);
		};
		// A line of several sentences, sentence by sentence when each has a translation.
		const translate = (k) => {
			const whole = one(k);
			const parts = whole || !lang?.stop ? [] : k.split(/(?<=[.!?]) +(?=[A-Z{[])/);
			if (parts.length < 2) return whole;
			const done = parts.map(one);
			if (!done.every(Boolean)) return whole;
			return done.map((t, i) => (i < done.length - 1 && !/\p{P}$/u.test(t) ? t + lang.stop : t)).join("");
		};
		let text = translate(key), what = "translated";
		if (!text && key.includes("\n")) {
			const lines = key.split("\n").map((k) => [k, translate(k)]);
			if (lines.some(([, t]) => t)) {
				text = lines.map(([k, t]) => t || k).join("\n");
				if (!lines.every(([, t]) => t)) what = "partly translated";
			}
		}
		if (!text) {
			const what = text === null ? "name not found" : "no pair";
			counts[what]++;
			examples.push({ step, what, line: english(key) });
			return line;
		}
		counts[what]++;
		if (what !== "translated") examples.push({ step, what, line: english(key) });
		return `${pre}"${rawKey}"${mid}${luaString(text)}${post}`;
	});
	return { text: out.join("\n"), counts, examples };
}

function luaFiles(dir) {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return luaFiles(path);
		return name.endsWith(".lua") && name !== "_pack.lua" ? [path] : [];
	});
}

// The script path is absolute: the child starts in the clone, so a relative one would not be found.
// process.execPath: the Node that runs us, not whatever `node` the PATH has.
function polestar(clone, args) {
	const dir = resolve(clone);
	return execFileSync(process.execPath, [join(dir, "tools/polestar.js"), "i18n", "guides", ...args], { cwd: dir, encoding: "utf8", stdio: "pipe" });
}

export async function fillPack({ polestar: clone, pack: packArg, locales, pairsByLocale, namesByLocale }) {
	// Polestar resolves --pack from the clone as cwd: pass one absolute path to every reader.
	const pack = resolve(packArg);
	try {
		polestar(clone, ["sync", ...locales, "--pack", pack]);
	} catch (e) {
		throw new Error(`i18n guides sync failed:\n${e.stdout ?? ""}${e.stderr ?? ""}`);
	}
	const counts = { translated: 0, "partly translated": 0, kept: 0, "no pair": 0, "name not found": 0 };
	// per file, by its path under locales/ ("zhCN/guides/x.lua"), for the report
	const files = {};
	for (const locale of locales) {
		const dir = join(pack, "locales", locale);
		const pairs = pairsByLocale[locale] ?? new Map();
		const before = new Map(luaFiles(dir).map((file) => [file, readFileSync(file, "utf8")]));
		// Shapes from what the pairs fill everywhere, so one guide's line helps another's.
		const own = OWN[locale] ?? {};
		const shapes = shapesOf([...before.values()].map((text) => fillText(text, pairs, namesByLocale[locale]).text), own.sentences);
		for (const [file, old] of before) {
			const { text, counts: c, examples } = fillText(old, pairs, namesByLocale[locale], { shapes, lang: own.lang });
			for (const k in c) counts[k] += c[k];
			files[relative(join(pack, "locales"), file).split(sep).join("/")] = { counts: c, examples };
			if (text !== old) writeFileSync(file, text);
		}
	}
	let check;
	try {
		check = { code: 0, output: polestar(clone, ["check", ...locales, "--pack", pack]) };
	} catch (e) {
		check = { code: e.status ?? 1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
	}
	return { counts, files, check };
}
