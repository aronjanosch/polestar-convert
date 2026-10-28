// Names of one language for the tokens of a translation key ("npc:234"): the names
// pack (Names.lua), the L file (skills) and the client tables (area, zone, spell).
// Browser-safe: the files come in through `read(path)` as data.mjs reads game data
// (`names/<locale>/...` on the web page); the command line's loadNames, which reads a
// Polestar clone, is in ../node/names.mjs.

import { readTable } from "../csv.mjs";

export const PACK_KINDS = ["npc", "object", "item", "quest", "map", "faction", "taxi"];
// token kind -> [client table, name column]
export const TABLES = {
	area: ["AreaTable", "AreaName_lang"],
	zone: ["UiMap", "Name_lang"],
	spell: ["SpellName", "Name_lang"],
};

// Lua string escapes as the clone writes them: \\ \" \n \r, the rest as is.
function unescape(text) {
	return text.replace(/\\(.)/gs, (_, c) => (c === "n" ? "\n" : c === "r" ? "\r" : c));
}

// kind -> Map<id, name> from the `add("<locale>", "<kind>", {` blocks of Names.lua's text.
export function parsePack(text, locale) {
	const kinds = new Map();
	if (!text) return kinds;
	let current = null;
	for (const line of text.split("\n")) {
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

// english -> name from the L file's `L["<english>"] = "<name>"` lines (commented ones are not).
export function parseL(text) {
	const map = new Map();
	if (!text) return map;
	for (const line of text.split("\n")) {
		const row = line.match(/^L\["((?:[^"\\]|\\.)*)"\]\s*=\s*"((?:[^"\\]|\\.)*)"\s*$/);
		if (row) map.set(unescape(row[1]), unescape(row[2]));
	}
	return map;
}

// id -> name from a client table's CSV text, one name column. Ids are numbers, as readTable gives them.
export function parseTable(text, column) {
	const map = new Map();
	if (!text || !text.trim()) return map;
	for (const [id, row] of readTable(text, "ID", [column])) if (row[column]) map.set(id, row[column]);
	return map;
}

// The namesOf function from its parts: `pack` kind -> Map, `L` Map, `tables` kind -> Map
// (ids as numbers), `clientTables`: null, or why some tables are missing.
export function makeNamesOf({ pack, L, tables, clientTables }) {
	const namesOf = (token, english) => {
		const [kind, id] = token.split(":");
		let name;
		if (kind === "skill") name = L.get(english);
		else if (PACK_KINDS.includes(kind)) name = pack.get(kind)?.get(id);
		else name = tables.get(kind)?.get(Number(id));
		return name ? [name] : [];
	};
	namesOf.clientTables = clientTables;
	return namesOf;
}

// The same names from the files `read(path)` gives ("names/<locale>/Names.lua",
// "L.lua", "<Table>.csv"); a missing file gives none of its kind. The returned function
// carries `clientTables`: null, or which tables are missing.
export async function namesFrom(read, locale) {
	const dir = `names/${locale}/`;
	const pack = parsePack(await read(`${dir}Names.lua`), locale);
	const L = parseL(await read(`${dir}L.lua`));
	const tables = new Map();
	const missing = [];
	for (const [kind, [table, column]] of Object.entries(TABLES)) {
		const text = await read(`${dir}${table}.csv`);
		if (!text || !text.trim()) missing.push(table);
		tables.set(kind, parseTable(text, column));
	}
	const clientTables = missing.length ? `missing ${missing.join(", ")} in ${dir}` : null;
	return makeNamesOf({ pack, L, tables, clientTables });
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
