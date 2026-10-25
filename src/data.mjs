// Polestar's reference data (data/forever in a Polestar clone, built with
// `polestar data build`). The converter reads it to turn names into ids and
// RXP world coordinates into zone percentages; it never writes it.
//
// `read(path)` gives a file's text by its path in the clone ("data/forever/quests.json"),
// or null when it is not there: a clone on disk, or the same files from a web page.

import { readTable } from "./csv.mjs";

// Every file loadData and Journey's loadNames read, by its path in the clone, for the
// builds `travel` (data/forever/travel.json) names: what a hosted copy of the data holds.
export function dataFiles(travel) {
	const forever = ["quests", "npcs", "zones", "map-frames", "items", "races", "objects", "codex/journal", "travel", "professions", "factions"].map((f) => `data/forever/${f}.json`);
	const wago = (build, table) => (build ? [`data/sources/wago/${build}/${table}.csv`] : []);
	return [...forever, ...wago(travel.foreverBuild, "AreaTable"), ...wago(travel.foreverBuild, "SpellName"), ...wago(travel.build, "WMOAreaTable")];
}

export async function loadData(read) {
	const json = async (f, need = true) => {
		const text = await read(`data/forever/${f}`);
		if (text == null && need) throw new Error(`data/forever/${f}: not found (run \`polestar data build\`)`);
		return text == null ? null : JSON.parse(text);
	};
	const quests = await json("quests.json");
	const npcs = await json("npcs.json");
	const zones = await json("zones.json");
	const frames = await json("map-frames.json");
	const items = await json("items.json");
	const races = await json("races.json");
	const objects = await json("objects.json");
	// Reputation factions by id (`rep` goals name them); an older build has none.
	const factions = (await json("factions.json", false)) || null;
	// Dungeon quests from the codex build: where each starts and ends, and the
	// dungeon's entrance for a giver inside it.
	const journal = new Map();
	const codex = await json("codex/journal.json", false);
	if (codex) {
		const dungeons = codex.dungeons || [];
		for (const d of Array.isArray(dungeons) ? dungeons : Object.values(dungeons)) {
			for (const q of [...(d.quests || []), ...Object.values(d.chain || {})]) {
				if (!journal.has(q.id)) journal.set(q.id, { start: q.start, finish: q.finish, entrance: d.entrance });
			}
		}
	}

	const npcByName = new Map();
	for (const npc of Object.values(npcs)) {
		const key = npc.name.toLowerCase();
		if (!npcByName.has(key)) npcByName.set(key, []);
		npcByName.get(key).push(npc);
	}
	// Inns and flight points (`polestar travel build`), when built.
	const travel = await json("travel.json", false);
	const inns = travel ? travel.inns || [] : [];
	const flights = travel && travel.taxi ? travel.taxi.nodes || [] : [];
	const hasProfessions = (await read("data/forever/professions.json")) != null;
	// Areas (zones and subzones) by AreaTable id, from the Forever client's table
	// `data build` caches: RXP names subzones by id.
	const build = travel && travel.foreverBuild;
	const areas = new Map();
	if (build) {
		for (const [id, r] of readTable(await read(`data/sources/wago/${build}/AreaTable.csv`), "ID", ["AreaName_lang", "ParentAreaID"])) {
			areas.set(id, { name: r.AreaName_lang, parent: Number(r.ParentAreaID) || 0 });
		}
	}
	return { quests, npcs, zones, frames, items, races, objects, factions, journal, inns, flights, hasProfessions, npcByName, areas };
}

// The elite a goal needs, by name, or null: a `kill` of an elite (rank 1-3:
// elite, rare elite, boss) or a `collect` of an item only elites drop.
// Polestar makes such goals optional in a Leveling guide.
export function eliteOf(data, goal) {
	const elite = (id) => data.npcs[id] && data.npcs[id].rank >= 1 && data.npcs[id].rank <= 3;
	if (goal.kind === "kill") return elite(goal.npc) ? data.npcs[goal.npc].name : null;
	if (goal.kind !== "collect") return null;
	const it = data.items[goal.item];
	const drops = it && it.drops;
	if (!drops || Object.keys(drops.object || {}).length || (it.vendors || []).length) return null;
	const from = Object.keys(drops.npc || {}).map(Number);
	return from.length && from.every(elite) ? data.npcs[from[0]].name : null;
}

// The item a vendor sells whose name is part of `item`'s name (Copper Rod for the Runed
// Copper Rod made from it), or null: RXP's "buy" line then names the made item, not the
// one the player buys. Only when exactly one fits.
export function baseItemSoldBy(data, item, npcId) {
	const it = data.items[item];
	if (!it || !it.name || !npcId || (it.vendors || []).length) return null;
	const hits = Object.entries(data.items).filter(([id, o]) => o.name && o.name !== it.name && it.name.endsWith(o.name) && (o.vendors || []).includes(npcId));
	return hits.length === 1 ? Number(hits[0][0]) : null;
}

// The reputation faction Polestar names `name` ("Stormwind City" is its "Stormwind"), or null.
// Without factions in the data, the name as given.
export function factionNamed(data, name) {
	if (!data.factions) return name;
	const all = Object.values(data.factions);
	const low = String(name).toLowerCase();
	const hit = all.find((f) => f.name.toLowerCase() === low) || all.find((f) => f.name.toLowerCase() === low.replace(/ city$/, ""));
	return hit ? hit.name : null;
}

// Whether a vendor in the data sells the item to `faction` ("Alliance" or "Horde"), as
// Polestar's `buy` finds one: a placed NPC of that side, or a service NPC of none (a goblin).
export function soldTo(data, item, faction) {
	const side = faction === "Alliance" ? "A" : faction === "Horde" ? "H" : null;
	return (data.items[item]?.vendors || []).some((id) => {
		const npc = data.npcs[id];
		// One the data places nowhere (inside a dungeon) is no vendor the arrow can lead to.
		if (!npc || !Object.keys(npc.spawns || {}).length) return false;
		if (npc.faction) return !side || npc.faction.includes(side);
		return (npc.roles || []).some((r) => ["vendor", "innkeeper", "repair"].includes(r));
	});
}

const near = (pt) => (o) => (pt && o.map === pt.uiMap ? Math.hypot(o.x - pt.x, o.y - pt.y) : 1e9);
const closest = (list, pt) => [...list].sort((a, b) => near(pt)(a) - near(pt)(b))[0] || null;

// The inn RXP names ("Southshore", or a zone: "Desolace"), nearest to `pt`
// when several fit; null when none does. Of `faction`'s own side when a town has
// inns of both (a neutral town keeps its one), and the inn the guide bound at
// (`prefer`, a location) when it is among those that fit.
export function innNamed(data, name, pt, faction = null, prefer = null) {
	const want = String(name || "").trim().toLowerCase();
	if (!want) return null;
	const side = faction === "Alliance" ? 0 : faction === "Horde" ? 1 : null;
	const pick = (list) => {
		const own = side == null ? list : list.filter((i) => i.c === side);
		const fit = own.length ? own : list;
		return fit.find((i) => prefer && i.location === prefer) || closest(fit, pt);
	};
	const byName = data.inns.filter((i) => i.location.toLowerCase() === want || (i.names || []).some((n) => n.toLowerCase() === want));
	if (byName.length) return pick(byName);
	const zoneIds = Object.entries(data.zones).filter(([, z]) => String(z.name).toLowerCase() === want).map(([id]) => Number(id));
	return pick(data.inns.filter((i) => zoneIds.includes(i.map)));
}

// The flight point RXP names ("Crossroads", "Redridge Mountains", "Azshara")
// for `faction`: by its short name, full name or zone; nearest to `pt` when
// several fit. -> its short name (what `getfp` takes) or null.
export function flightNamed(data, name, faction, pt) {
	const bare = (t) => String(t || "").trim().toLowerCase().replace(/^the\s+/, "");
	const want = bare(name);
	if (!want) return null;
	const side = faction === "Alliance" ? 1 : faction === "Horde" ? 2 : null;
	const mine = data.flights.filter((n) => !side || n.faction === side || n.faction === 3);
	const zoneOf = (n) => bare((data.zones[n.map] || {}).name);
	// The first rule that finds a point decides: its names as written, the zone it is in,
	// then a zone or point named by its start ("Redridge" for Redridge Mountains,
	// "Sun Rock" for Sun Rock Retreat).
	const rules = [
		(n) => n.short.toLowerCase() === want || n.name.toLowerCase() === want || n.name.toLowerCase().startsWith(want + ","),
		(n) => zoneOf(n) === want,
		(n) => zoneOf(n).startsWith(want + " ") || bare(n.name.split(",").slice(1).join(",")).startsWith(want),
		(n) => bare(n.short).startsWith(want + " ") || bare(n.short).split(/\s+/).includes(want),
	];
	for (const rule of rules) {
		const hits = mine.filter(rule);
		if (!hits.length) continue;
		const exact = hits.find((n) => n.short.toLowerCase() === want);
		return (exact || closest(hits, pt)).short;
	}
	return null;
}

// Whether Polestar's data gives a goal a place of its own (spawns of the npc,
// object or a dropping source; a `complete`'s objectives are left to the guide).
export function goalPlaced(data, goal) {
	const spawned = (e) => !!(e && e.spawns && Object.keys(e.spawns).length);
	if (goal.kind === "kill") return spawned(data.npcs[goal.npc]);
	if (goal.kind === "interact") return spawned(data.objects[goal.object]);
	if (goal.kind === "collect") {
		const drops = (data.items[goal.item] || {}).drops || {};
		return Object.keys(drops.npc || {}).some((id) => spawned(data.npcs[id])) || Object.keys(drops.object || {}).some((id) => spawned(data.objects[id]));
	}
	return false;
}

// Whether the data places the NPC or object a quest starts or ends at
// (`start`/`end`): a giver inside a dungeon has no spawn on any map.
export function questEndPlaced(data, ends) {
	if (!ends) return false;
	const placed = (e) => e && e.spawns && Object.keys(e.spawns).length > 0;
	const npcs = ends.npc || [], objects = ends.object || [];
	// Polestar points at a giver first; only a quest with none starts from its item alone.
	if (!npcs.length && !objects.length) return (ends.item || []).length > 0;
	return npcs.some((id) => placed(data.npcs[id])) || objects.some((id) => placed(data.objects[id]));
}

// Where the codex places a dungeon quest's giver (`start`) or hand-in
// (`finish`): its own spot, or the dungeon's entrance when it is inside.
// -> { map, x, y, live } | null
export function journalPlace(data, questId, which) {
	const j = data.journal && data.journal.get(questId);
	const p = j && j[which];
	const spot = p && !p.inside && p.map != null && p.x != null ? p : j && j.entrance;
	return spot && spot.map != null && spot.x != null ? { map: Number(spot.map), x: spot.x, y: spot.y, live: spot.f !== "e" } : null;
}

// Whether any race of `faction` (narrowed to `raceNames` when given) may take
// the quest, by its race mask in the data: what Polestar's lint checks too.
export function questOpenTo(data, quest, faction, raceNames) {
	if (!quest || !quest.races || !data.races) return true;
	const want = raceNames && raceNames.map((r) => (r === "Undead" ? "Scourge" : r));
	let mask = 0n;
	for (const [name, sides] of Object.entries(data.races)) {
		if (want && !want.includes(name)) continue;
		for (const [side, r] of Object.entries(sides)) if (!faction || side === faction) mask |= BigInt(r.bit);
	}
	return mask === 0n || (BigInt(quest.races) & mask) !== 0n;
}

// RXP "<uiMap>/<floor>,X,Y" world coordinates -> zone percentages (0-100).
// Checked against the data: Undertaker Mordo 1667.77,1679.04 -> 30.2,71.7.
export function worldToZone(data, uiMap, x, y) {
	const f = (data.frames.forever || {})[uiMap] || (data.frames.era || {})[uiMap];
	if (!f) return null;
	const px = ((f.left - x) / (f.left - f.right)) * 100;
	const py = ((f.top - y) / (f.top - f.bottom)) * 100;
	return { x: round(px), y: round(py), live: !!(data.frames.forever || {})[uiMap] };
}

function round(v) { return Math.round(v * 100) / 100; }

// The uiMapID of a zone RXP names ("Tirisfal Glades,30.2,71.7"): one with a map frame.
export function zoneIdNamed(data, name) {
	const want = String(name || "").trim().toLowerCase();
	const framed = (id) => (data.frames.era || {})[id] || (data.frames.forever || {})[id];
	const hits = Object.entries(data.zones).filter(([id, z]) => String(z.name).toLowerCase() === want && framed(id)).map(([id]) => Number(id));
	return hits.length ? hits[0] : null;
}

export function zoneName(data, uiMap) {
	const z = data.zones[uiMap];
	return z ? z.name : null;
}

// An AreaTable area by id: { name, parent } (parent 0: a zone), or null.
export function areaOf(data, id) {
	return (data.areas && data.areas.get(Number(id))) || null;
}

// The NPC named `name` whose spawn lies closest to (uiMap, x, y); null when
// the name is unknown. `pt` is optional: without it a unique match is needed.
export function findNpc(data, name, uiMap, pt) {
	const list = data.npcByName.get((name || "").toLowerCase());
	if (!list || !list.length) return { npc: null, why: "unknown" };
	if (list.length === 1) return { npc: list[0] };
	if (!pt) return { npc: null, why: "ambiguous" };
	let best = null, bestD = Infinity;
	for (const npc of list) {
		const spawn = npc.spawns && npc.spawns[uiMap];
		if (!spawn) continue;
		for (const [px, py] of spawn.pts) {
			const d = Math.hypot(px - pt.x, py - pt.y);
			if (d < bestD) { bestD = d; best = npc; }
		}
	}
	return best && bestD < 6 ? { npc: best } : { npc: null, why: "ambiguous" };
}
