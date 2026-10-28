// Names Journey refers to by id that `src/data.mjs` does not load: areas
// (AreaTable), spells (SpellName) and buildings (WMOAreaTable), from the client tables a Polestar
// clone caches in data/sources/wago/<build>/ (the build travel.json names), plus
// lookups by id into Polestar's inns and flight points. `read` as for loadData;
// `levelXp`: XP from one level to the next, as Polestar counts it
// (tools/lib/game/xp.js LEVEL_XP), or null.

import { table } from "../csv.mjs";

export async function loadNames(read, data, levelXp = null) {
	const tf = await read("data/forever/travel.json");
	const travel = tf != null ? JSON.parse(tf) : {};
	const build = travel.foreverBuild || null;
	const csv = (b, name) => (b ? read(`data/sources/wago/${b}/${name}.csv`) : null);
	const areas = table(await csv(build, "AreaTable"), "ID", "AreaName_lang");
	const spells = table(await csv(build, "SpellName"), "ID", "Name_lang");
	// Buildings: Journey numbers them as the Era client does (WMOAreaTable of the
	// Era build travel.json names; cache it with Polestar's wago cachedTable).
	const wmos = table(await csv(travel.build, "WMOAreaTable"), "ID", "AreaName_lang");
	const nodeById = new Map((data.flights || []).map((n) => [n.id, n]));
	return {
		area: (id) => areas.get(Number(id)) || null,
		spell: (id) => spells.get(Number(id)) || null,
		wmo: (id) => wmos.get(Number(id)) || null,
		zone: (id) => (data.zones[id] ? data.zones[id].name : null),
		// The inn whose area is `areaId` (sethearthstone, HEARTHSTONE[a]) -> its location.
		inn: (areaId) => {
			const inn = (data.inns || []).find((i) => i.area === Number(areaId));
			return inn ? inn.location : null;
		},
		// A taxi node by its TaxiNodes id -> { short, name, faction, ... } | null.
		taxi: (id) => nodeById.get(Number(id)) || null,
		levelXp: (level) => (levelXp ? levelXp[level] ?? null : null),
	};
}
