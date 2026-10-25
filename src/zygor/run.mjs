// A whole Zygor run without file access: the two leveling files' text in, the
// `.guide` texts and the gap report out.

import { extractGuides, parseBody } from "./parse.mjs";
import { convertGuide } from "./convert.mjs";
import { Report } from "../ir.mjs";

// The guide files under ZygorGuidesViewerClassic/Guides-Classic/: per family its folder
// and file stem, one file per faction (`<stem>HordeCLASSIC.lua`). A side without its full
// file reads the free trial file the viewer ships (`…CLASSICTrial.lua`), never both.
export const ZYGOR_FAMILIES = [
	{ family: "Leveling", stem: "ZygorLeveling" },
	{ family: "Dungeons", stem: "ZygorDungeon" },
	{ family: "Professions", stem: "ZygorProfessions" },
	{ family: "Reputations", stem: "ZygorReputations" },
	{ family: "Events", stem: "ZygorEvents" },
];
const SIDE_NAME = { horde: "Horde", alliance: "Alliance" };
// Every file the converter may read, by its path under Guides-Classic/, full ones first.
export const ZYGOR_PATHS = ZYGOR_FAMILIES.flatMap(({ family, stem }) => ["", "Trial"].flatMap((t) => Object.values(SIDE_NAME).map((side) => `${family}/${stem}${side}CLASSIC${t}.lua`)));
export const ZYGOR_FILES = { horde: "ZygorLevelingHordeCLASSIC.lua", alliance: "ZygorLevelingAllianceCLASSIC.lua" };
export const ZYGOR_TRIAL_FILES = { horde: "ZygorLevelingHordeCLASSICTrial.lua", alliance: "ZygorLevelingAllianceCLASSICTrial.lua" };

// read(path under Guides-Classic/) -> file text or null. -> { <family>: { horde, alliance } }
export async function readZygor(read) {
	const lua = {};
	for (const { family, stem } of ZYGOR_FAMILIES) {
		lua[family] = {};
		for (const [key, side] of Object.entries(SIDE_NAME)) {
			const base = `${family}/${stem}${side}CLASSIC`;
			lua[family][key] = (await read(`${base}.lua`)) ?? (await read(`${base}Trial.lua`)) ?? "";
		}
	}
	return lua;
}
const SIDES = [
	{ side: "h", faction: "Horde", key: "horde" },
	{ side: "a", faction: "Alliance", key: "alliance" },
];
export const ZYGOR_SETTINGS = { hardcore: false, selfmade: false };

const slugify = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
// A leveling chapter: "Leveling Guides\Invented Starter (1-13)" -> "h-invented-starter-1-13" (h or a: the
// faction). Any other guide names its path below the top folder, after its family:
// "Dungeon Guides\Invented Hollow Quests" -> "h-dungeons-invented-hollow-quests".
const parts = (name) => String(name).split("\\");
const isChapter = (g) => g.family === "Leveling" && (/\(\d+-\d+\)\s*$/.test(g.name) || /Class Quests$/.test(g.name));
const slugOf = (g) => isChapter(g) ? `${g.side}-${slugify(parts(g.name).pop())}` : `${g.side}-${slugify(g.family)}-${slugify(parts(g.name).slice(1).join(" "))}`;

// Polestar's guide menu: the category of a guide, and its folder (Zygor's folders between
// the top one and the guide: "Cooking · Farming Guides").
function placeOf(g) {
	const mid = parts(g.name).slice(1, -1);
	const folder = mid.length ? mid.join(" · ") : null;
	if (g.family === "Dungeons") return { category: "Dungeons", folder };
	if (g.family === "Professions") return { category: "Professions", folder };
	if (g.family === "Reputations") return { category: "Reputation", folder };
	if (g.family === "Events") return { category: "Miscellaneous", folder: folder || "Events" };
	if (isChapter(g)) return { category: null, folder: null };
	return { category: /Field Duty/.test(g.name) ? "Reputation" : "Miscellaneous", folder };
}

// The guides a Classic Era character can play: not the Season of Discovery ones (shown only
// there), the hidden startup wizard or Zygor's placeholder.
function wanted(g) {
	const h = g.header;
	if (/not\s+ZGV\.IsClassicSoD/.test(h.hideif || "")) return false;
	if (/^function\(\)\s*return false\s*end$/.test(h.condition_visible || "")) return false;
	if (/Season of Discovery/.test(g.name)) return false;
	if (g.family === "Leveling") return g.name.startsWith("Leveling Guides\\");
	return true;
}

// lua: { <family>: { horde, alliance } } file texts (readZygor; any may be empty), or the
// leveling files alone as { horde, alliance }. opts: { packId, only }.
// -> { guides: [{ slug, text, stepsIn, stepsOut, format }], gaps, settings, report }
export function convertZygor(lua, data, opts) {
	const { packId } = opts;
	const byFamily = "horde" in lua || "alliance" in lua ? { Leveling: lua } : lua;
	// Every guide of both factions, with its file's family, side and faction.
	const all = [];
	for (const { family } of ZYGOR_FAMILIES) for (const { side, faction, key } of SIDES) {
		for (const g of extractGuides((byFamily[family] || {})[key] || "")) {
			const guide = { ...g, family, side, faction };
			if (wanted(guide)) all.push({ ...guide, steps: parseBody(g.body), ...placeOf(guide) });
		}
	}
	const byName = new Map(all.map((g) => [`${g.side}|${g.name}`, g]));
	// Slugs are unique: a second guide of one name (Zygor lists some twice) gets `-2`.
	const slugFor = new Map(), taken = new Map();
	for (const g of all) {
		const base = slugOf(g);
		const n = (taken.get(base) || 0) + 1;
		taken.set(base, n);
		slugFor.set(g, n > 1 ? `${base}-${n}` : base);
	}
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
		const r = convertGuide(g, data, { report, slug, packId, faction: g.faction, before: beforeOf(g), next, category: g.category, folder: g.folder });
		guides.push({ slug, text: r.text, stepsIn: r.stepsIn, stepsOut: r.stepsOut, format: r.format });
		gaps[`${slug}.guide`] = r.gaps;
	}
	return { guides, gaps, settings: { ...ZYGOR_SETTINGS }, report };
}
