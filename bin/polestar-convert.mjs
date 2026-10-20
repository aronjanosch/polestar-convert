#!/usr/bin/env node
// polestar-convert rxp --file <RXP guide .lua> --polestar <clone> --pack <pack dir> [--only "<name>"] [--native-verbs abandon,destroy]
//
// Reads guides you own from your own install and writes `.guide` files into a
// local Polestar pack. It carries no guide content of its own.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { extractGuides, parseGuide, parseName } from "../src/rxp/parse.mjs";
import { convertGuide } from "../src/rxp/convert.mjs";
import { planChain } from "../src/rxp/chain.mjs";
import { Report } from "../src/ir.mjs";
import { loadData } from "../src/data.mjs";

function args(argv) {
	const out = { _: [] };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[++i];
		else out._.push(argv[i]);
	}
	return out;
}

const a = args(process.argv.slice(2));
const [cmd] = a._;
if (cmd !== "rxp" || !a.file || !a.polestar || !a.pack) {
	console.error('usage: polestar-convert rxp --file <guide.lua> --polestar <clone> --pack <pack dir> [--only "<guide name>"] [--native-verbs abandon,destroy]');
	process.exit(2);
}

const data = loadData(a.polestar);
// Verbs a newer Polestar has as goals; without them these RXP commands become tasks.
const native = new Set(String(a["native-verbs"] || "").split(",").map((s) => s.trim()).filter(Boolean));
const packJson = JSON.parse(readFileSync(join(a.pack, "pack.json"), "utf8"));
const packId = packJson.id;
const guidesDir = join(a.pack, "guides");
if (!existsSync(guidesDir)) mkdirSync(guidesDir, { recursive: true });

const parsed = extractGuides(readFileSync(a.file, "utf8")).map(parseGuide);
const chosen = parsed.filter((g) => !a.only || (g.header.name || "") === a.only);
if (!chosen.length) { console.error("no guide matches"); process.exit(1); }

const report = new Report();
// Slugs, hand-offs and the quests taken on the way in come from the whole file,
// so `--only` still knows what the guides before it accept.
const plan = planChain(parsed, report);
for (const g of chosen) {
	const slug = plan.slug.get(g);
	const next = plan.next.get(g).map((n) => plan.slug.get(n));
	const r = convertGuide(g, data, { report, slug, packId, next, before: plan.before.get(g), native });
	writeFileSync(join(guidesDir, `${slug}.guide`), r.text);
	console.log(`${slug}: ${r.stepsIn} RXP steps -> ${r.stepsOut} steps, pack format ${r.format}`);
}

console.log("\n== counts");
for (const [k, v] of [...report.counts].sort((x, y) => y[1] - x[1])) if (v) console.log(String(v).padStart(5), k);
console.log("\n== needs a look");
for (const it of report.items.slice(0, 60)) console.log(`step ${it.stepNo}: ${it.what}${it.line ? "  [" + String(it.line).slice(0, 70) + "]" : ""}`);
if (report.items.length > 60) console.log(`... and ${report.items.length - 60} more`);
