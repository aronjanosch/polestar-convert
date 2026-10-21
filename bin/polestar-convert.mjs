#!/usr/bin/env node
// polestar-convert rxp --file <RXP guide .lua> | --list <GuideList-forever.xml> --polestar <clone> --pack <pack dir> [--only "<name>"] [--max-start N] [--self-found yes]
//
// Reads guides you own from your own install and writes `.guide` files into a
// local Polestar pack. It carries no guide content of its own.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { extractGuides, parseGuide, parseName } from "../src/rxp/parse.mjs";
import { convertGuide, spellNames } from "../src/rxp/convert.mjs";
import { planChain, expandIncludes } from "../src/rxp/chain.mjs";
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
if (cmd !== "rxp" || !(a.file || a.list) || !a.polestar || !a.pack) {
	console.error('usage: polestar-convert rxp --file <guide.lua> | --list <RXPGuides/Guides/GuideList-forever.xml> --polestar <clone> --pack <pack dir> [--only "<guide name>"] [--max-start N] [--self-found yes]');
	process.exit(2);
}

const data = loadData(a.polestar);
const packJson = JSON.parse(readFileSync(join(a.pack, "pack.json"), "utf8"));
const packId = packJson.id;
const guidesDir = join(a.pack, "guides");
if (!existsSync(guidesDir)) mkdirSync(guidesDir, { recursive: true });

// A path as the XML writes it, matched case-insensitively (the game's file system
// ignores case: "Guides/forever/..." is the "Forever" folder).
function resolveLoose(root, rel) {
	let cur = root;
	for (const part of rel.split(/[\\/]/)) {
		const hit = existsSync(join(cur, part)) ? part : (readdirSync(cur).find((n) => n.toLowerCase() === part.toLowerCase()) || null);
		if (!hit) return null;
		cur = join(cur, hit);
	}
	return cur;
}
// `--list`: every guide file RXP's guide list loads, in its order, in one run, so a
// chain runs across files.
const files = a.list
	? [...readFileSync(a.list, "utf8").matchAll(/<Script file="([^"]+)"/g)].map((m) => m[1]).filter((f) => !/Import\.lua$/i.test(f))
		.map((f) => resolveLoose(dirname(dirname(a.list)), f) || (console.error(`missing: ${f}`), null)).filter(Boolean)
	: [a.file];
const report0 = new Report();
const parsed = expandIncludes(files.flatMap((f) => extractGuides(readFileSync(f, "utf8")).map(parseGuide)), report0);

const report = report0;
// Spell names for `cast`, from every guide's lines that cast them.
const spells = spellNames(parsed);
// Slugs, hand-offs and the quests taken on the way in come from the whole file,
// so a guide picked alone still knows what the guides before it accept.
const plan = planChain(parsed, report);
const convert = (g, rep, next) => convertGuide(g, data, { report: rep, slug: plan.slug.get(g), packId, next, before: plan.before.get(g), spells, selfFound: a["self-found"] != null });
// A first pass with a report of its own: a guide left with no steps (every step a
// variant left out) is not written, nor one past `--max-start N`.
const keep = (g) => {
	const r = convert(g, new Report(), []);
	if (!r.stepsOut) { report.count("guide with no steps left (not written)"); return false; }
	if (a["max-start"] == null) return true;
	const lo = Number(String(r.levels || "").split("-")[0]);
	return lo > 0 && lo <= Number(a["max-start"]);
};
const chosen = parsed.filter((g) => !plan.hidden.has(g) && (!a.only || (g.header.name || "") === a.only) && keep(g));
if (!chosen.length) { console.error("no guide matches"); process.exit(1); }
const kept = new Set(chosen);

for (const g of chosen) {
	const slug = plan.slug.get(g);
	// A hand-off to a guide this run does not write would point nowhere.
	const next = plan.next.get(g).filter((n) => kept.has(n)).map((n) => plan.slug.get(n));
	const r = convert(g, report, next);
	writeFileSync(join(guidesDir, `${slug}.guide`), r.text);
	console.log(`${slug}: ${r.stepsIn} RXP steps -> ${r.stepsOut} steps, pack format ${r.format}`);
}

console.log("\n== counts");
for (const [k, v] of [...report.counts].sort((x, y) => y[1] - x[1])) if (v) console.log(String(v).padStart(5), k);
console.log("\n== needs a look");
for (const it of report.items.slice(0, 60)) console.log(`step ${it.stepNo}: ${it.what}${it.line ? "  [" + String(it.line).slice(0, 70) + "]" : ""}`);
if (report.items.length > 60) console.log(`... and ${report.items.length - 60} more`);
