// The core's `read(path)` over a folder on disk, for the command line. The web page
// has its own over the files the player picks.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { createRequire } from "node:module";

// A path as a guide addon writes it, matched case-insensitively (the game's file system
// ignores case: "Guides/forever/..." is the "Forever" folder). -> the path on disk or null.
export function resolveLoose(root, rel) {
	let cur = root;
	for (const part of rel.split(/[\\/]/)) {
		if (!part) continue;
		const hit = existsSync(join(cur, part)) ? part : (statSync(cur, { throwIfNoEntry: false })?.isDirectory() && readdirSync(cur).find((n) => n.toLowerCase() === part.toLowerCase())) || null;
		if (!hit) return null;
		cur = join(cur, hit);
	}
	return cur;
}

// read(path) under `root`: the file's text, or null when there is none.
export function folderReader(root) {
	return async (rel) => {
		const p = resolveLoose(root, rel);
		return p && statSync(p).isFile() ? readFileSync(p, "utf8") : null;
	};
}

// XP from one level to the next as the clone counts it (tools/lib/game/xp.js), or null.
export function levelXpOf(clone) {
	const xpLib = join(resolve(clone), "tools", "lib", "game", "xp.js");
	return existsSync(xpLib) ? createRequire(import.meta.url)(xpLib).LEVEL_XP : null;
}

// RXP's SavedVariables (imported guides, src/rxp/saved.mjs): every account's
// RXPGuides.lua in the WTF folder of the client an AddOns folder sits in, as bytes
// ([] when there is none: guides never imported leave no file).
export function savedVariablesOf(addons) {
	const wtf = resolveLoose(dirname(dirname(resolve(addons))), "WTF/Account");
	if (!wtf || !statSync(wtf, { throwIfNoEntry: false }).isDirectory()) return [];
	const out = [];
	for (const account of readdirSync(wtf)) {
		const file = resolveLoose(join(wtf, account), "SavedVariables/RXPGuides.lua");
		if (file && statSync(file).isFile()) out.push(readFileSync(file));
	}
	return out;
}
