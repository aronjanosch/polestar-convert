// Polestar's reference data (data/forever in a Polestar clone, built with
// `polestar data build`). The converter reads it to turn names into ids and
// RXP world coordinates into zone percentages; it never writes it.

import { readFileSync } from "node:fs";
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

	const npcByName = new Map();
	for (const npc of Object.values(npcs)) {
		const key = npc.name.toLowerCase();
		if (!npcByName.has(key)) npcByName.set(key, []);
		npcByName.get(key).push(npc);
	}
	return { quests, npcs, zones, frames, items, races, npcByName };
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
