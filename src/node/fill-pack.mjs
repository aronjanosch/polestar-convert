// fillPack: the pack's locale files written by Polestar's `i18n guides sync`, filled
// (fill.mjs) and checked by its `i18n guides check`. Node only.

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { fillText, shapesOf } from "../i18n/fill.mjs";
import { OWN } from "../i18n/own.mjs";

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
