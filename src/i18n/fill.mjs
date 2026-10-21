// Fill the empty lines of a pack's locale files from paired texts.
// The files are the ones `i18n guides sync` writes; a line that already holds
// text is never changed, and a line that does not pair stays "".

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative, sep } from "node:path";
import { execFileSync } from "node:child_process";

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

export function fillText(fileText, pairs, namesOf) {
	const fuzzy = byPattern(pairs);
	const counts = { translated: 0, kept: 0, "no pair": 0, "name not found": 0 };
	const examples = [];
	let tokens = new Map();
	let step = null;
	const out = fileText.split("\n").map((line) => {
		const at = /^\t-- (?:Step (\d+)|Guide)\b/.exec(line);
		if (at) step = at[1] ? Number(at[1]) : null;
		if (/^\t-- \{/.test(line)) { tokens = readTokens(line); return line; }
		const m = LINE.exec(line);
		if (!m) return line;
		const [, pre, rawKey, mid, rawValue, post] = m;
		const mine = tokens;
		tokens = new Map();
		if (rawValue !== "") { counts.kept++; return line; }
		const key = decode(rawKey);
		const english = key.replace(TOKEN, (all, tok) => mine.get(tok) ?? all);
		const tr = pairs.get(english) ?? fuzzy(key, mine);
		if (tr === undefined || tr === "") { counts["no pair"]++; examples.push({ step, what: "no pair", line: english }); return line; }
		const done = putTokens(tr, key, mine, namesOf);
		if (done.missing) { counts["name not found"]++; examples.push({ step, what: "name not found", line: english }); return line; }
		counts.translated++;
		return `${pre}"${rawKey}"${mid}${luaString(done.text)}${post}`;
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

function polestar(polestarDir, args) {
	return execFileSync("node", [join(polestarDir, "tools/polestar.js"), "i18n", "guides", ...args], { cwd: polestarDir, encoding: "utf8", stdio: "pipe" });
}

export async function fillPack({ polestar: clone, pack: packArg, locales, pairsByLocale, namesByLocale }) {
	// Polestar resolves --pack from the clone as cwd: pass one absolute path to every reader.
	const pack = resolve(packArg);
	try {
		polestar(clone, ["sync", ...locales, "--pack", pack]);
	} catch (e) {
		throw new Error(`i18n guides sync failed:\n${e.stdout ?? ""}${e.stderr ?? ""}`);
	}
	const counts = { translated: 0, kept: 0, "no pair": 0, "name not found": 0 };
	// per file, by its path under locales/ ("zhCN/guides/x.lua"), for the report
	const files = {};
	for (const locale of locales) {
		const dir = join(pack, "locales", locale);
		for (const file of luaFiles(dir)) {
			const before = readFileSync(file, "utf8");
			const { text, counts: c, examples } = fillText(before, pairsByLocale[locale] ?? new Map(), namesByLocale[locale]);
			for (const k in c) counts[k] += c[k];
			files[relative(join(pack, "locales"), file).split(sep).join("/")] = { counts: c, examples };
			if (text !== before) writeFileSync(file, text);
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
