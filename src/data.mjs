// Polestar's reference data (data/forever in a Polestar clone, built with
// `polestar data build`). The converter reads it to turn names into ids and
// RXP world coordinates into zone percentages; it never writes it.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export function loadData(polestarDir) {
	const dir = join(polestarDir, "data", "forever");
	const read = (f) => JSON.parse(readFileSync(join(dir, f), "utf8"));
	const quests = read("quests.json");
	const npcs = read("npcs.json");
	const zones = read("zones.json");
	const frames = read("map-frames.json");
	const items = read("items.json");
	const races = read("races.json");
	const objects = read("objects.json");
	// Dungeon quests from the codex build: where each starts and ends, and the
	// dungeon's entrance for a giver inside it.
	const journal = new Map();
	const jf = join(dir, "codex", "journal.json");
	if (existsSync(jf)) {
		const dungeons = JSON.parse(readFileSync(jf, "utf8")).dungeons || [];
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
	return { quests, npcs, zones, frames, items, races, objects, journal, npcByName };
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

export function zoneName(data, uiMap) {
	const z = data.zones[uiMap];
	return z ? z.name : null;
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
