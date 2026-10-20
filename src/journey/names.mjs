// Names Journey refers to by id that `src/data.mjs` does not load: areas
// (AreaTable) and spells (SpellName), from the Forever client tables a Polestar
// clone caches in data/sources/wago/<build>/ (the build travel.json names), plus
// lookups by id into Polestar's inns and flight points. Read only.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Minimal CSV: quoted fields with "" escapes, no newlines inside fields.
function csvRows(text) {
	const rows = [];
	for (const line of text.split("\n")) {
		if (!line) continue;
		const out = [];
		let i = 0;
		while (i <= line.length) {
			if (line[i] === '"') {
				let v = "";
				i++;
				while (i < line.length) {
					if (line[i] === '"' && line[i + 1] === '"') { v += '"'; i += 2; } else if (line[i] === '"') { i++; break; } else v += line[i++];
				}
				out.push(v);
				i++; // comma
			} else {
				const e = line.indexOf(",", i);
				out.push(line.slice(i, e < 0 ? line.length : e));
				i = e < 0 ? line.length + 1 : e + 1;
			}
		}
		rows.push(out);
	}
	return rows;
}

function table(file, idCol, nameCol) {
	const map = new Map();
	if (!existsSync(file)) return map;
	const rows = csvRows(readFileSync(file, "utf8").replace(/\r/g, ""));
	const head = rows.shift();
	const id = head.indexOf(idCol), name = head.indexOf(nameCol);
	for (const r of rows) map.set(Number(r[id]), r[name]);
	return map;
}

export function loadNames(polestarDir, data) {
	const tf = join(polestarDir, "data", "forever", "travel.json");
	const build = existsSync(tf) ? JSON.parse(readFileSync(tf, "utf8")).foreverBuild : null;
	const dir = build ? join(polestarDir, "data", "sources", "wago", build) : null;
	const areas = dir ? table(join(dir, "AreaTable.csv"), "ID", "AreaName_lang") : new Map();
	const spells = dir ? table(join(dir, "SpellName.csv"), "ID", "Name_lang") : new Map();
	const nodeById = new Map((data.flights || []).map((n) => [n.id, n]));
	return {
		area: (id) => areas.get(Number(id)) || null,
		spell: (id) => spells.get(Number(id)) || null,
		zone: (id) => (data.zones[id] ? data.zones[id].name : null),
		// The inn whose area is `areaId` (sethearthstone, HEARTHSTONE[a]) -> its location.
		inn: (areaId) => {
			const inn = (data.inns || []).find((i) => i.area === Number(areaId));
			return inn ? inn.location : null;
		},
		// A taxi node by its TaxiNodes id -> { short, name, faction, ... } | null.
		taxi: (id) => nodeById.get(Number(id)) || null,
	};
}
