// loadNames for the command line: a Polestar clone's names (addon/, client tables
// through Polestar's own wago.js, cached under data/sources/wago/<build>/<locale>/).
// The parsing is shared with the web page's namesFrom in ../i18n/names.mjs.

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { parsePack, parseL, makeNamesOf, TABLES } from "../i18n/names.mjs";

// The returned function carries `clientTables`: null, or why area/zone/spell names are missing.
export async function loadNames(clone, locale, { offline = false, log = () => {}, wago } = {}) {
	// createRequire reads a path without ./ as a package name: always an absolute one.
	const polestarDir = resolve(clone);
	const text = (file) => (existsSync(file) ? readFileSync(file, "utf8") : null);
	const pack = parsePack(text(join(polestarDir, "addon", `Polestar_Names_${locale}`, "Names.lua")), locale);
	const L = parseL(text(join(polestarDir, "addon", "Polestar", "Locales", `${locale}.lua`)));

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
			tables.set(kind, new Map(rows.filter((r) => r[column]).map((r) => [Number(r.ID), r[column]])));
		}
	} catch (err) {
		// one line for all three tables; those kinds then give nothing
		tables.clear();
		clientTables = err.message;
		log(`client tables for ${locale}: ${err.message}`);
	}
	return makeNamesOf({ pack, L, tables, clientTables });
}
