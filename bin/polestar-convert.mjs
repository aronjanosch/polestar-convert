#!/usr/bin/env node
// polestar-convert zygor --dir <ZygorGuidesViewerClassic> --polestar <clone> --pack <pack dir> [--only "<guide>"]
// polestar-convert rxp --file <RXP guide .lua> | --list <GuideList-forever.xml> --polestar <clone> --pack <pack dir> [--only "<name>"] [--max-start N] [--self-found yes] [--locales all|none|zhCN,deDE]
//
// Reads guides you own from your own install and writes `.guide` files into a
// local Polestar pack. It carries no guide content of its own.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, resolve, sep } from "node:path";
import { extractGuides, parseGuide } from "../src/rxp/parse.mjs";
import { convertRxp, guideList } from "../src/rxp/run.mjs";
import { Report } from "../src/ir.mjs";
import { loadData } from "../src/data.mjs";
import { pairLanguage } from "../src/rxp/locale.mjs";
import { loadNames, withPaired } from "../src/i18n/names.mjs";
import { fillPack } from "../src/i18n/fill.mjs";
import { folderReader, resolveLoose } from "../src/node/read.mjs";

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
	await (await import("../src/journey/cli.mjs")).run(a);
	process.exit(0);
}
if (cmd === "zygor") {
	await (await import("../src/zygor/cli.mjs")).run(a);
	process.exit(0);
}
if (cmd !== "rxp" || !(a.file || a.list) || !a.polestar || !a.pack) {
	console.error('usage: polestar-convert rxp --file <guide.lua> | --list <RXPGuides/Guides/GuideList-forever.xml> --polestar <clone> --pack <pack dir> [--only "<guide name>"] [--max-start N] [--self-found yes] [--locales all|none|zhCN,deDE]');
	process.exit(2);
}

const data = await loadData(folderReader(a.polestar));
const packJson = JSON.parse(readFileSync(join(a.pack, "pack.json"), "utf8"));
const packId = packJson.id;
const guidesDir = join(a.pack, "guides");
if (!existsSync(guidesDir)) mkdirSync(guidesDir, { recursive: true });

// `--list`: every guide file RXP's guide list loads, in its order, in one run, so a
// chain runs across files.
const files = a.list
	? guideList(readFileSync(a.list, "utf8")).map((f) => resolveLoose(dirname(dirname(a.list)), f) || (console.error(`missing: ${f}`), null)).filter(Boolean)
	: [a.file];
const { guides, report, rawByFile, written, convert } = convertRxp(files.map((f) => ({ path: f, text: readFileSync(f, "utf8") })), data,
	{ packId, only: a.only, maxStart: a["max-start"], selfFound: a["self-found"] != null });
if (!guides.length) { console.error("no guide matches"); process.exit(1); }
for (const g of guides) {
	writeFileSync(join(guidesDir, `${g.slug}.guide`), g.text);
	console.log(`${g.slug}: ${g.stepsIn} RXP steps -> ${g.stepsOut} steps, pack format ${g.format}`);
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
	if (!locales.length) { if (want !== "all") process.exitCode = 1; return; } // asked for, found nothing

	// One absolute path for every reader (loadNames requires from it, polestar runs inside it).
	const clone = resolve(a.polestar);
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
		namesByLocale[locale] = withPaired(await loadNames(clone, locale, { log: console.error }), run.names);
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
	let filled, check;
	try {
		({ files: filled, check } = await fillPack({ polestar: clone, pack: a.pack, locales: done, pairsByLocale, namesByLocale }));
	} catch (e) {
		// the sync failed: no files to report on, but the report still says so
		console.error(`i18n guides sync failed: ${e.message}`);
		out.sync = { failed: e.message };
		writeReport();
		process.exitCode = 1;
		return;
	}

	console.log("\n== translations");
	const noTables = [];
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
		if (namesByLocale[locale].clientTables) { out.locales[locale].clientTables = namesByLocale[locale].clientTables; noTables.push(locale); }
		console.log(`${locale}: ${total.translated} of ${total.texts} texts translated`);
	}
	out.check = check;
	writeReport();
	console.log(check.code ? `i18n guides check failed:\n${check.output}` : "i18n guides check: ok");
	if (noTables.length) console.log(`names of areas, zones and spells are missing for ${noTables.join(", ")} (client tables could not be loaded, see the report): run again with network access to wago.tools to fill them`);
	if (check.code || done.length < locales.length) process.exitCode = 1;
}
