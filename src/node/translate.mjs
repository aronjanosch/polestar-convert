// RXP's translated guides into a pack's locale files, for the command line: RXP keeps
// a language's copy of each guide file, and Polestar's own tools (i18n guides sync,
// check) write and check the locale files.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { extractGuides, parseGuide } from "../rxp/parse.mjs";
import { Report } from "../ir.mjs";
import { pairLanguage, lineMemory } from "../rxp/locale.mjs";
import { withPaired } from "../i18n/names.mjs";
import { loadNames } from "./names.mjs";
import { fillPack } from "../i18n/fill.mjs";
import { resolveLoose } from "./read.mjs";

// RXPGuides/Guides/<rel> -> RXPGuides and <rel>; RXP keeps a language's copy at
// RXPGuides/lang/Guides-<locale>/<rel>.
export function underGuides(file) {
	const parts = resolve(file).split(sep);
	const i = parts.findLastIndex((p) => p.toLowerCase() === "guides");
	return i < 0 ? null : { root: parts.slice(0, i).join(sep), rel: parts.slice(i + 1).join("/") };
}

// The line texts of every guide file RXP ships in a language beside its English one.
function memoryOf(root, dir) {
	const memory = new Map();
	const read = (p) => extractGuides(readFileSync(p, "utf8")).map(parseGuide);
	for (const rel of readdirSync(dir, { recursive: true }).filter((n) => n.endsWith(".lua")).sort()) {
		const en = resolveLoose(join(root, "Guides"), rel);
		if (en) lineMemory(read(en), read(join(dir, rel)), memory);
	}
	return memory;
}

// Each language RXP has: the chosen guides converted again with its words, their
// texts paired with the English ones and filled into the pack's locale files.
export async function translateRxp({ want = "all", root, fromList, files, run: { rawByFile, written, convert }, polestar, pack }) {
	if (want === "none") return;
	const langDir = root && join(root, "lang");
	if (!langDir || !existsSync(langDir)) { console.log("\nno translated guides (no lang/ beside Guides/)"); return; }
	const listName = "GuideList-forever.xml";
	const found = readdirSync(langDir).map((n) => /^Guides-(\w+)$/.exec(n)?.[1]).filter(Boolean)
		.filter((l) => !fromList || existsSync(join(langDir, `Guides-${l}`, listName)));
	const locales = want === "all" ? found : want.split(",").map((l) => l.trim()).filter((l) => found.includes(l) || (console.error(`no translated guides for ${l}`), false));
	if (!locales.length) { if (want !== "all") process.exitCode = 1; return; } // asked for, found nothing

	// One absolute path for every reader (loadNames requires from it, polestar runs inside it).
	const clone = resolve(polestar);
	const pairsByLocale = {}, namesByLocale = {}, runs = {}, failed = {};
	// One language that throws is left out; the others and the English go on.
	for (const locale of locales) try {
		const dir = join(langDir, `Guides-${locale}`);
		// `--list`: only the files the language's own list loads.
		const listed = fromList && new Set([...readFileSync(join(dir, listName), "utf8").matchAll(/<Script file="([^"]+)"/g)]
			.map((m) => resolveLoose(dir, m[1])).filter(Boolean));
		const trByFile = files.map((f) => {
			const rel = underGuides(f)?.rel;
			const p = rel && resolveLoose(dir, rel);
			return p && (!listed || listed.has(p)) ? extractGuides(readFileSync(p, "utf8")).map(parseGuide) : [];
		});
		const run = pairLanguage(rawByFile, trByFile, written, (guide, it) => convert(guide, new Report(), it.next, it.g).text, memoryOf(root, dir));
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
		const reportsDir = join(pack, "reports");
		if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
		writeFileSync(join(reportsDir, "rxp-locales.json"), JSON.stringify(out, null, 1) + "\n");
	};
	if (!done.length) { writeReport(); process.exitCode = 1; return; }
	let filled, check;
	try {
		({ files: filled, check } = await fillPack({ polestar: clone, pack, locales: done, pairsByLocale, namesByLocale }));
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
		const total = { texts: 0, translated: 0, "partly translated": 0, kept: 0, "no pair": 0, "name not found": 0 };
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
		console.log(`${locale}: ${total.translated} of ${total.texts} texts translated, ${total["partly translated"]} in part`);
	}
	out.check = check;
	writeReport();
	console.log(check.code ? `i18n guides check failed:\n${check.output}` : "i18n guides check: ok");
	if (noTables.length) console.log(`names of areas, zones and spells are missing for ${noTables.join(", ")} (client tables could not be loaded, see the report): run again with network access to wago.tools to fill them`);
	if (check.code || done.length < locales.length) process.exitCode = 1;
}
