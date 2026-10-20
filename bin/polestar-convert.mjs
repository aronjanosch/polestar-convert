#!/usr/bin/env node
// polestar-convert rxp --file <RXP guide .lua> --polestar <clone> --pack <pack dir> [--only "<name>"]
//
// Reads guides you own from your own install and writes `.guide` files into a
// local Polestar pack. It carries no guide content of its own.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { extractGuides, parseGuide, parseName } from "../src/rxp/parse.mjs";
import { convertGuide, Report } from "../src/emit.mjs";
import { loadData } from "../src/data.mjs";

function args(argv) {
	const out = { _: [] };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[++i];
		else out._.push(argv[i]);
	}
	return out;
}

function slugOf(name) {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const a = args(process.argv.slice(2));
const [cmd] = a._;
if (cmd !== "rxp" || !a.file || !a.polestar || !a.pack) {
	console.error('usage: polestar-convert rxp --file <guide.lua> --polestar <clone> --pack <pack dir> [--only "<guide name>"]');
	process.exit(2);
}

const data = loadData(a.polestar);
const packJson = JSON.parse(readFileSync(join(a.pack, "pack.json"), "utf8"));
const packId = packJson.id;
const guidesDir = join(a.pack, "guides");
if (!existsSync(guidesDir)) mkdirSync(guidesDir, { recursive: true });

const parsed = extractGuides(readFileSync(a.file, "utf8")).map(parseGuide);
const chosen = parsed.filter((g) => !a.only || (g.header.name || "") === a.only);
if (!chosen.length) { console.error("no guide matches"); process.exit(1); }

// Two guides can share a name (Alliance and Horde, or other editions): keep slugs unique.
const slugOfGuide = new Map();
const used = new Map();
for (const g of chosen) {
	let slug = slugOf(g.header.name || "guide");
	const n = used.get(slug) || 0;
	used.set(slug, n + 1);
	if (n) slug += `-${slugOf(g.header.faction || "") || "x"}-${n + 1}`;
	slugOfGuide.set(g, slug);
}
const slugs = new Map(chosen.map((g) => [g.header.name, slugOfGuide.get(g)]));
const report = new Report();
const accepted = new Set(); // quests accepted anywhere in this run
const seen = new Set(); // quests whose accept has already been emitted, in route order
for (const g of chosen) {
	const slug = slugOfGuide.get(g);
	const nextName = (g.header.next || "").split(";")[0].trim();
	const next = slugs.get(nextName) || null;
	const r = convertGuide(g, data, { report, slug, packId, next, accepted, seen });
	writeFileSync(join(guidesDir, `${slug}.guide`), r.text);
	console.log(`${slug}: ${r.stepsIn} RXP steps -> ${r.stepsOut} steps, pack format ${r.format}`);
}

console.log("\n== counts");
for (const [k, v] of [...report.counts].sort((x, y) => y[1] - x[1])) if (v) console.log(String(v).padStart(5), k);
console.log("\n== needs a look");
for (const it of report.items.slice(0, 60)) console.log(`step ${it.stepNo}: ${it.what}${it.line ? "  [" + String(it.line).slice(0, 70) + "]" : ""}`);
if (report.items.length > 60) console.log(`... and ${report.items.length - 60} more`);
