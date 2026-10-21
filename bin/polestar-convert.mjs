#!/usr/bin/env node
// polestar-convert zygor --dir <ZygorGuidesViewerClassic> --polestar <clone> --pack <pack dir> [--only "<guide>"]
// polestar-convert rxp --file <RXP guide .lua> | --list <GuideList-forever.xml> --polestar <clone> --pack <pack dir> [--only "<name>"] [--max-start N] [--self-found yes] [--locales all|none|zhCN,deDE]
//
// Reads guides you own from your own install and writes `.guide` files into a
// local Polestar pack. It carries no guide content of its own.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, resolve, sep } from "node:path";
import { extractGuides, parseGuide, parseName } from "../src/rxp/parse.mjs";
import { convertGuide, spellNames } from "../src/rxp/convert.mjs";
import { planChain, expandIncludes } from "../src/rxp/chain.mjs";
import { Report } from "../src/ir.mjs";
import { loadData } from "../src/data.mjs";
import { pairLanguage } from "../src/rxp/locale.mjs";
import { loadNames, withPaired } from "../src/i18n/names.mjs";
import { fillPack } from "../src/i18n/fill.mjs";

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
if (cmd === "journey") {
	(await import("../src/journey/cli.mjs")).run(a);
	process.exit(0);
}
if (cmd === "zygor") {
	(await import("../src/zygor/cli.mjs")).run(a);
	process.exit(0);
}
if (cmd !== "rxp" || !(a.file || a.list) || !a.polestar || !a.pack) {
	console.error('usage: polestar-convert rxp --file <guide.lua> | --list <RXPGuides/Guides/GuideList-forever.xml> --polestar <clone> --pack <pack dir> [--only "<guide name>"] [--max-start N] [--self-found yes] [--locales all|none|zhCN,deDE]');
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
// The guides of each file as parsed: a translated file pairs with its English one guide by guide.
const rawByFile = files.map((f) => extractGuides(readFileSync(f, "utf8")).map(parseGuide));
const parsed = expandIncludes(rawByFile.flat(), report0);

const report = report0;
// Spell names for `cast`, from every guide's lines that cast them.
const spells = spellNames(parsed);
// Slugs, hand-offs and the quests taken on the way in come from the whole file,
// so a guide picked alone still knows what the guides before it accept.
const plan = planChain(parsed, report);
// `en`: the English guide whose plan a translated one takes.
const convert = (g, rep, next, en = g) => convertGuide(g, data, { report: rep, slug: plan.slug.get(en), packId, next, before: plan.before.get(en), spells, selfFound: a["self-found"] != null });
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

const written = [];
for (const g of chosen) {
	const slug = plan.slug.get(g);
	// A hand-off to a guide this run does not write would point nowhere.
	const next = plan.next.get(g).filter((n) => kept.has(n)).map((n) => plan.slug.get(n));
	const r = convert(g, report, next);
	writeFileSync(join(guidesDir, `${slug}.guide`), r.text);
	written.push({ at: parsed.indexOf(g), slug, text: r.text, next, g });
	console.log(`${slug}: ${r.stepsIn} RXP steps -> ${r.stepsOut} steps, pack format ${r.format}`);
}

console.log("\n== counts");
for (const [k, v] of [...report.counts].sort((x, y) => y[1] - x[1])) if (v) console.log(String(v).padStart(5), k);
console.log("\n== needs a look");
for (const it of report.items.slice(0, 60)) console.log(`step ${it.stepNo}: ${it.what}${it.line ? "  [" + String(it.line).slice(0, 70) + "]" : ""}`);
if (report.items.length > 60) console.log(`... and ${report.items.length - 60} more`);
await translate();

// RXPGuides/Guides/<rel> -> RXPGuides and <rel>; RXP keeps a language's copy at
// RXPGuides/lang/Guides-<locale>/<rel>.
function underGuides(file) {
	const parts = resolve(file).split(sep);
	const i = parts.findLastIndex((p) => p.toLowerCase() === "guides");
	return i < 0 ? null : { root: parts.slice(0, i).join(sep), rel: parts.slice(i + 1).join("/") };
}

// Each language RXP has: the chosen guides converted again with its words, their
// texts paired with the English ones and filled into the pack's locale files.
async function translate() {
	const want = a.locales ?? "all";
	if (want === "none") return;
	const root = a.list ? dirname(dirname(resolve(a.list))) : underGuides(a.file)?.root;
	const langDir = root && join(root, "lang");
	if (!langDir || !existsSync(langDir)) { console.log("\nno translated guides (no lang/ beside Guides/)"); return; }
	const listName = "GuideList-forever.xml";
	const found = readdirSync(langDir).map((n) => /^Guides-(\w+)$/.exec(n)?.[1]).filter(Boolean)
		.filter((l) => !a.list || existsSync(join(langDir, `Guides-${l}`, listName)));
	const locales = want === "all" ? found : want.split(",").map((l) => l.trim()).filter((l) => found.includes(l) || (console.error(`no translated guides for ${l}`), false));
	if (!locales.length) return;

	const pairsByLocale = {}, namesByLocale = {}, runs = {}, failed = {};
	// One language that throws is left out; the others and the English go on.
	for (const locale of locales) try {
		const dir = join(langDir, `Guides-${locale}`);
		// `--list`: only the files the language's own list loads.
		const listed = a.list && new Set([...readFileSync(join(dir, listName), "utf8").matchAll(/<Script file="([^"]+)"/g)]
			.map((m) => resolveLoose(dir, m[1])).filter(Boolean));
		const trByFile = files.map((f) => {
			const rel = underGuides(f)?.rel;
			const p = rel && resolveLoose(dir, rel);
			return p && (!listed || listed.has(p)) ? extractGuides(readFileSync(p, "utf8")).map(parseGuide) : [];
		});
		const run = pairLanguage(rawByFile, trByFile, written, (guide, it) => convert(guide, new Report(), it.next, it.g).text);
		runs[locale] = run;
		pairsByLocale[locale] = run.pairs;
		namesByLocale[locale] = withPaired(await loadNames(a.polestar, locale, { log: console.error }), run.names);
	} catch (e) {
		failed[locale] = e.message;
		delete runs[locale]; delete pairsByLocale[locale];
		console.error(`${locale}: failed: ${e.message}`);
	}
	const out = { locales: {} };
	for (const [locale, message] of Object.entries(failed)) out.locales[locale] = { failed: message, pairing: { "locale: failed": 1 } };
	const done = locales.filter((l) => !failed[l]);
	const writeReport = () => {
		const reportsDir = join(a.pack, "reports");
		if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
		writeFileSync(join(reportsDir, "rxp-locales.json"), JSON.stringify(out, null, 1) + "\n");
	};
	if (!done.length) { writeReport(); process.exitCode = 1; return; }
	const { files: filled, check } = await fillPack({ polestar: a.polestar, pack: a.pack, locales: done, pairsByLocale, namesByLocale });

	console.log("\n== translations");
	for (const locale of done) {
		const total = { texts: 0, translated: 0, kept: 0, "no pair": 0, "name not found": 0 };
		const pairing = {};
		const guides = {};
		for (const [slug, rep] of runs[locale].guides) {
			const f = filled[`${locale}/guides/${slug}.lua`] ?? { counts: {}, examples: [] };
			for (const [k, v] of Object.entries(f.counts)) { total[k] += v; total.texts += v; }
			for (const [k, v] of rep.counts) pairing[k] = (pairing[k] ?? 0) + v;
			guides[slug] = { counts: { ...Object.fromEntries(rep.counts), ...f.counts }, examples: f.examples };
		}
		out.locales[locale] = { ...total, pairing, guides };
		console.log(`${locale}: ${total.translated} of ${total.texts} texts translated`);
	}
	out.check = check;
	writeReport();
	console.log(check.code ? `i18n guides check failed:\n${check.output}` : "i18n guides check: ok");
	if (check.code || done.length < locales.length) process.exitCode = 1;
}
