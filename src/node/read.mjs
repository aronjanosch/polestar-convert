// The core's `read(path)` over a folder on disk, for the command line. The web page
// has its own over the files the player picks.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
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
