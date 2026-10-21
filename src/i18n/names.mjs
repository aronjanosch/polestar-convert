// Names of one language for the tokens of a translation key ("npc:234"):
// the clone's names pack, its client tables (area, zone, spell) and its L file.

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const PACK_KINDS = ["npc", "object", "item", "quest", "map", "faction", "taxi"];
// token kind -> [client table, name column]
const TABLES = {
	area: ["AreaTable", "AreaName_lang"],
	zone: ["UiMap", "Name_lang"],
	spell: ["SpellName", "Name_lang"],
};

// Lua string escapes as the clone writes them: \\ \" \n \r, the rest as is.
function unescape(text) {
	return text.replace(/\\(.)/gs, (_, c) => (c === "n" ? "\n" : c === "r" ? "\r" : c));
}

// kind -> Map<id, name> from the `add("<locale>", "<kind>", {` blocks.
function readPack(file, locale) {
	const kinds = new Map();
	if (!existsSync(file)) return kinds;
	let current = null;
	for (const line of readFileSync(file, "utf8").split("\n")) {
		const open = line.match(/^add\("([^"]+)",\s*"([^"]+)",\s*\{\s*$/);
		if (open) {
			current = null;
			if (open[1] !== locale) continue;
			if (!kinds.has(open[2])) kinds.set(open[2], new Map());
			current = kinds.get(open[2]);
			continue;
		}
		if (line.startsWith("})")) { current = null; continue; }
		const row = current && line.match(/^\[(\d+)\]="((?:[^"\\]|\\.)*)",?\s*$/);
		if (row) current.set(row[1], unescape(row[2]));
	}
	return kinds;
}

// english -> name from `L["<english>"] = "<name>"` lines (commented ones are not).
function readL(file) {
	const map = new Map();
	if (!existsSync(file)) return map;
	for (const line of readFileSync(file, "utf8").split("\n")) {
		const row = line.match(/^L\["((?:[^"\\]|\\.)*)"\]\s*=\s*"((?:[^"\\]|\\.)*)"\s*$/);
		if (row) map.set(unescape(row[1]), unescape(row[2]));
	}
	return map;
}

// The returned function carries `clientTables`: null, or why area/zone/spell names are missing.
export async function loadNames(clone, locale, { offline = false, log = () => {}, wago } = {}) {
	// createRequire reads a path without ./ as a package name: always an absolute one.
	const polestarDir = resolve(clone);
	const pack = readPack(join(polestarDir, "addon", `Polestar_Names_${locale}`, "Names.lua"), locale);
	const L = readL(join(polestarDir, "addon", "Polestar", "Locales", `${locale}.lua`));

	wago ??= createRequire(import.meta.url)(join(polestarDir, "tools", "lib", "data", "wago.js"));
	const sourcesDir = join(polestarDir, "data", "sources");
	const tables = new Map(); // kind -> Map<id, name>
	let clientTables = null;
	try {
		const { build } = await wago.pickBuild({
			sourcesDir, offline: true, product: "forever", tables: ["AreaTable", "UiMap", "SpellName"],
		});
		const get = (url) => fetch(url).then((r) => {
			if (!r.ok) throw new Error(`${url}: ${r.status}`);
			return r.text();
		});
		for (const [kind, [table, column]] of Object.entries(TABLES)) {
			const rows = await wago.cachedTable({ sourcesDir, build, table, locale, offline, get });
			tables.set(kind, new Map(rows.filter((r) => r[column]).map((r) => [r.ID, r[column]])));
		}
	} catch (err) {
		// one line for all three tables; those kinds then give nothing
		tables.clear();
		clientTables = err.message;
		log(`client tables for ${locale}: ${err.message}`);
	}

	const namesOf = (token, english) => {
		const [kind, id] = token.split(":");
		let name;
		if (kind === "skill") name = L.get(english);
		else if (PACK_KINDS.includes(kind)) name = pack.get(kind)?.get(id);
		else name = tables.get(kind)?.get(id);
		return name ? [name] : [];
	};
	namesOf.clientTables = clientTables;
	return namesOf;
}

// The pack's names first, then the one paired from RXP's own line (no duplicates).
export function withPaired(namesOf, paired) {
	const both = (token, english) => {
		const names = namesOf(token, english);
		const extra = paired.get(english);
		return extra && !names.includes(extra) ? [...names, extra] : names;
	};
	both.clientTables = namesOf.clientTables;
	return both;
}
