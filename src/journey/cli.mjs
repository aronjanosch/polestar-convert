// polestar-convert journey --dir <Journey addon> --polestar <clone> --pack <pack dir> [--only "<description or guideID>"] [--max-start N] [--native-verbs destroy] [--ah no] [--groups no]
//
// Reads the guides of your own Journey install and writes `.guide` files into a
// local Polestar pack. Decoded guide text stays in memory; nothing of it is
// written anywhere but the pack.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { decodeSlot, parseLua, parseCatalog } from "./parse.mjs";
import { convertGuide } from "./convert.mjs";
import { loadNames } from "./names.mjs";
import { Report } from "../ir.mjs";
import { loadData } from "../data.mjs";

const USAGE = 'usage: polestar-convert journey --dir <Journey addon folder> --polestar <clone> --pack <pack dir> [--only "<description or guideID>"] [--max-start N] [--native-verbs destroy] [--ah no] [--groups no]';

// "H06TG" (a jump button's guide) -> the catalog's "H06TG_FVR".
function catalogId(catalog, id) {
	return (catalog.find((e) => e.guideID === id) || catalog.find((e) => e.guideID.startsWith(id + "_")) || {}).guideID || null;
}
const slugOf = (e) => `${e.guideID.replace(/_FVR$/, "").toLowerCase()}-${String(e.description || "").replace(/^\d+-\d+\s+/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

export function run(a) {
	if (!a.dir || !a.polestar || !a.pack) { console.error(USAGE); process.exit(2); }
	const data = loadData(a.polestar);
	const names = loadNames(a.polestar, data);
	const native = new Set(String(a["native-verbs"] || "").split(",").map((s) => s.trim()).filter(Boolean));
	const fixed = { AH: a.ah !== "no", GROUPS: a.groups !== "no" };
	const packId = JSON.parse(readFileSync(join(a.pack, "pack.json"), "utf8")).id;
	const guidesDir = join(a.pack, "guides");
	if (!existsSync(guidesDir)) mkdirSync(guidesDir, { recursive: true });

	const gdir = join(a.dir, "data", "Guides");
	const catalog = parseCatalog(decodeSlot(readFileSync(join(gdir, "guides.html"), "utf8")));
	const slotText = new Map();
	const guideOf = (e) => {
		const f = join(gdir, `${String(e.slot).padStart(4, "0")}.html`);
		if (!existsSync(f)) return null;
		if (!slotText.has(f)) slotText.set(f, parseLua(decodeSlot(readFileSync(f, "utf8"))));
		return slotText.get(f);
	};
	const entries = catalog.filter((e) => guideOf(e));

	// Pass 1, each guide alone: what it accepts, where its buttons lead, whether
	// anything is left of it.
	const first = new Map();
	for (const e of entries) {
		const r = convertGuide(e, guideOf(e), data, { report: new Report(), slug: slugOf(e), packId, names, native, fixed });
		first.set(e.guideID, r);
	}
	// The guides each one hands off to (its jump buttons naming another guide) and,
	// from those, every guide before it in the chain.
	const nextIds = new Map(entries.map((e) => [e.guideID, first.get(e.guideID).jumps.map((j) => catalogId(catalog, j)).filter((id) => id && id !== e.guideID)]));
	const before = new Map();
	const prevOf = (id) => entries.filter((e) => (nextIds.get(e.guideID) || []).includes(id)).map((e) => e.guideID);
	for (const e of entries) {
		const seen = new Set();
		const todo = prevOf(e.guideID);
		while (todo.length) { const p = todo.pop(); if (seen.has(p)) continue; seen.add(p); todo.push(...prevOf(p)); }
		const q = new Set();
		for (const p of seen) for (const id of first.get(p).accepted) q.add(id);
		before.set(e.guideID, q);
	}

	const real = (r) => r.text.split("\n").some((l) => /^ {2}(accept|turnin|kill|collect|complete|interact|level|vendor|train|buy|getfp|fly|sethome)\b/.test(l));
	const startOf = (e) => Number(String(e.levels || "").split("-")[0]);
	const report = new Report();
	const chosen = entries.filter((e) => {
		if (a.only && e.description !== a.only && e.guideID !== a.only && e.guideID !== a.only + "_FVR") return false;
		if (!real(first.get(e.guideID))) { report.count("guide with nothing to do (placeholder, not written)"); return false; }
		return a["max-start"] == null || startOf(e) <= Number(a["max-start"]);
	});
	if (!chosen.length) { console.error("no guide matches"); process.exit(1); }
	const kept = new Set(chosen.map((e) => e.guideID));
	const written = new Set(entries.filter((e) => real(first.get(e.guideID))).map((e) => e.guideID));
	for (const e of chosen) {
		const byId = new Map(entries.map((x) => [x.guideID, x]));
		// A hand-off to a guide this run does not write would point nowhere.
		const next = (nextIds.get(e.guideID) || []).filter((id) => (a.only ? kept : written).has(id) && byId.get(id).faction === e.faction).map((id) => slugOf(byId.get(id)));
		const r = convertGuide(e, guideOf(e), data, { report, slug: slugOf(e), packId, names, native, fixed, before: before.get(e.guideID), next });
		writeFileSync(join(guidesDir, `${slugOf(e)}.guide`), r.text);
		console.log(`${slugOf(e)}: ${r.stepsIn} Journey steps -> ${r.stepsOut} steps, pack format ${r.format}`);
	}

	console.log("\n== counts");
	for (const [k, v] of [...report.counts].sort((x, y) => y[1] - x[1])) if (v) console.log(String(v).padStart(5), k);
	console.log("\n== needs a look");
	for (const it of report.items.slice(0, 80)) console.log(`${it.guide} step ${it.stepNo}: ${it.what}${it.line ? "  [" + String(it.line).slice(0, 90) + "]" : ""}`);
	if (report.items.length > 80) console.log(`... and ${report.items.length - 80} more`);
}
