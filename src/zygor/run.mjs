// A whole Zygor run without file access: the two leveling files' text in, the
// `.guide` texts and the gap report out.

import { extractGuides, parseBody } from "./parse.mjs";
import { convertGuide } from "./convert.mjs";
import { Report } from "../ir.mjs";

// The leveling files under ZygorGuidesViewerClassic/Guides-Classic/Leveling/.
export const ZYGOR_FILES = { horde: "ZygorLevelingHordeCLASSIC.lua", alliance: "ZygorLevelingAllianceCLASSIC.lua" };
// The free trial guides the viewer ships (the starting zones), read for a side whose
// full file is not there; both hold the same starting zones, so never both.
export const ZYGOR_TRIAL_FILES = { horde: "ZygorLevelingHordeCLASSICTrial.lua", alliance: "ZygorLevelingAllianceCLASSICTrial.lua" };
const SIDES = [
	{ side: "h", faction: "Horde", key: "horde" },
	{ side: "a", faction: "Alliance", key: "alliance" },
];
export const ZYGOR_SETTINGS = { hardcore: false, selfmade: false };

const slugify = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
// "Leveling Guides\Invented Starter (1-13)" -> "h-invented-starter-1-13" (h or a: the faction).
const slugOf = (side, name) => `${side}-${slugify(String(name).split("\\").pop())}`;

// The guides the leveling chain and class quests are made of: a leveled chapter or a
// class quest guide, not the SoD rune guides or the hidden wizard.
function wanted(g) {
	const h = g.header;
	if (!g.name.startsWith("Leveling Guides\\")) return false;
	if (/IsClassicSoD/.test(h.hideif || "")) return false;
	if (/^function\(\)\s*return false\s*end$/.test(h.condition_visible || "")) return false;
	return /\(\d+-\d+\)\s*$/.test(g.name) || /Class Quests$/.test(g.name);
}

// lua: { horde, alliance } file texts (one may be empty). opts: { packId, only }.
// -> { guides: [{ slug, text, stepsIn, stepsOut, format }], gaps, settings, report }
export function convertZygor(lua, data, opts) {
	const { packId } = opts;
	// Every guide of both factions, with its file's side and faction.
	const all = [];
	for (const { side, faction, key } of SIDES) {
		for (const g of extractGuides(lua[key] || "").filter(wanted)) all.push({ ...g, side, faction, steps: parseBody(g.body) });
	}
	const byName = new Map(all.map((g) => [`${g.side}|${g.name}`, g]));
	const slugFor = new Map(all.map((g) => [g, slugOf(g.side, g.name)]));
	const nextOf = (g) => (g.header.next ? byName.get(`${g.side}|${g.header.next}`) || null : null);

	// Pass 1, each guide alone: what it accepts. A guide's chain-mates before it
	// (the guides whose `next` leads to it, transitively) give `before`.
	const accepted = new Map();
	for (const g of all) accepted.set(g, convertGuide(g, data, { report: new Report(), slug: slugFor.get(g), packId, faction: g.faction }).accepted);
	const prevOf = (g) => all.filter((p) => nextOf(p) === g);
	const beforeOf = (g) => {
		const seen = new Set();
		const todo = prevOf(g);
		while (todo.length) { const p = todo.pop(); if (seen.has(p)) continue; seen.add(p); todo.push(...prevOf(p)); }
		return new Set([...seen].flatMap((p) => [...accepted.get(p)]));
	};

	const only = opts.only;
	const chosen = all.filter((g) => !only || g.name === only || slugFor.get(g) === only || g.name.endsWith("\\" + only));
	const kept = new Set(chosen);
	const report = new Report();
	const gaps = {}, guides = [];
	for (const g of chosen) {
		const slug = slugFor.get(g);
		// A hand-off to a guide this run does not write would point nowhere.
		const nx = nextOf(g);
		const next = nx && kept.has(nx) ? [slugFor.get(nx)] : [];
		const r = convertGuide(g, data, { report, slug, packId, faction: g.faction, before: beforeOf(g), next });
		guides.push({ slug, text: r.text, stepsIn: r.stepsIn, stepsOut: r.stepsOut, format: r.format });
		gaps[`${slug}.guide`] = r.gaps;
	}
	return { guides, gaps, settings: { ...ZYGOR_SETTINGS }, report };
}
