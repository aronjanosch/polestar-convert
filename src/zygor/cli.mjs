// polestar-convert zygor --dir <ZygorGuidesViewerClassic> --polestar <clone> --pack <pack dir> [--only "<guide name or slug>"]
//
// Reads the Classic leveling guides of your own Zygor install and writes `.guide`
// files into a local Polestar pack. Guide text stays in memory; nothing of it is
// written anywhere but the pack.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { extractGuides, parseBody } from "./parse.mjs";
import { convertGuide } from "./convert.mjs";
import { Report } from "../ir.mjs";
import { loadData } from "../data.mjs";

const USAGE = 'usage: polestar-convert zygor --dir <ZygorGuidesViewerClassic folder> --polestar <clone> --pack <pack dir> [--only "<guide name or slug>"]';
const SIDES = [
	{ side: "h", faction: "Horde", file: "ZygorLevelingHordeCLASSIC.lua" },
	{ side: "a", faction: "Alliance", file: "ZygorLevelingAllianceCLASSIC.lua" },
];

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

export function run(a) {
	if (!a.dir || !a.polestar || !a.pack) { console.error(USAGE); process.exit(2); }
	const data = loadData(a.polestar);
	const packId = JSON.parse(readFileSync(join(a.pack, "pack.json"), "utf8")).id;
	const guidesDir = join(a.pack, "guides");
	if (!existsSync(guidesDir)) mkdirSync(guidesDir, { recursive: true });

	// Every guide of both factions, with its file's side and faction.
	const all = [];
	for (const { side, faction, file } of SIDES) {
		const lua = readFileSync(join(a.dir, "Guides-Classic", "Leveling", file), "utf8");
		for (const g of extractGuides(lua).filter(wanted)) all.push({ ...g, side, faction, steps: parseBody(g.body) });
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

	const chosen = all.filter((g) => !a.only || g.name === a.only || slugFor.get(g) === a.only || g.name.endsWith("\\" + a.only));
	if (!chosen.length) { console.error("no guide matches"); process.exit(1); }
	const kept = new Set(chosen);
	const report = new Report();
	const gaps = {};
	for (const g of chosen) {
		const slug = slugFor.get(g);
		// A hand-off to a guide this run does not write would point nowhere.
		const nx = nextOf(g);
		const next = nx && kept.has(nx) ? [slugFor.get(nx)] : [];
		const r = convertGuide(g, data, { report, slug, packId, faction: g.faction, before: beforeOf(g), next });
		writeFileSync(join(guidesDir, `${slug}.guide`), r.text);
		gaps[`${slug}.guide`] = r.gaps;
		console.log(`${slug}: ${r.stepsIn} Zygor steps -> ${r.stepsOut} steps, pack format ${r.format}`);
	}

	const reportsDir = join(a.pack, "reports");
	if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
	const settings = { hardcore: false, selfmade: false };
	writeFileSync(join(reportsDir, "zygor-gaps.json"), JSON.stringify({ source: "Zygor Guide Viewer Classic (local install)", settings, guides: gaps }, null, 1) + "\n");
	const total = Object.values(gaps).reduce((n, g) => n + g.length, 0);
	console.log(`gaps: ${total} entries in ${join(reportsDir, "zygor-gaps.json")}`);

	console.log("\n== counts");
	for (const [k, v] of [...report.counts].sort((x, y) => y[1] - x[1])) if (v) console.log(String(v).padStart(7), k);
	console.log("\n== needs a look");
	for (const it of report.items.slice(0, 80)) console.log(`${it.guide} step ${it.stepNo}: ${it.what}${it.line ? "  [" + String(it.line).slice(0, 90) + "]" : ""}`);
	if (report.items.length > 80) console.log(`... and ${report.items.length - 80} more`);
}
