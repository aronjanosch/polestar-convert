#!/usr/bin/env node
// Builds the web page for GitHub Pages: web/ and the converter's src/ as they are,
// and polestar-data/, the reference data the converter reads, copied from a
// Polestar clone with its data built. That data set is published under GPLv3 (it
// holds QuestieDB facts) with a notice of its sources; the code stays MIT.
//
// Usage: node tools/pages.mjs --polestar <clone> [--out <dir>] [--commit <sha>]   (default out/pages;
// --commit names Polestar's commit when the clone is a copy without git)
// For a data set without QuestieDB (if QuestieDB's licence does not allow it),
// build the clone's data with `data build --no-questie` and run this on that clone:
// the page then says the Forever-only quests are missing.
// names/<locale>/ holds the translated names for the locales below, when the clone has them.

import { mkdirSync, rmSync, cpSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { dataFiles } from "../src/data.mjs";
import { levelXpOf } from "../src/node/read.mjs";

function args(argv) {
	const out = {};
	for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[++i];
	return out;
}

const a = args(process.argv.slice(2));
if (!a.polestar) {
	console.error("usage: node tools/pages.mjs --polestar <clone> [--out <dir>]");
	process.exit(2);
}
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clone = resolve(a.polestar);
const out = resolve(a.out || join(repo, "out", "pages"));
const forever = join(clone, "data", "forever");
if (!existsSync(join(forever, "quests.json"))) {
	console.error(`${clone}: no data/forever (run \`node tools/polestar.js data build\`, \`travel build\`, \`profession build\` and \`codex build\` in it)`);
	process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(repo, "web"), out, { recursive: true });
// The converter as the page imports it; the Node-only modules stay out, and of src/i18n
// only names.mjs (the page reads the names files; fill.mjs and friends write them).
const i18n = join(repo, "src", "i18n");
cpSync(join(repo, "src"), join(out, "src"), { recursive: true, filter: (p) => !p.includes(`${join("src", "node")}`) && !/[\\/]cli\.mjs$/.test(p) && (!p.startsWith(i18n) || p === i18n || p === join(i18n, "names.mjs")) });
writeFileSync(join(out, ".nojekyll"), "");

// The data: every file the converter reads, at its path in the clone.
const dataDir = join(out, "polestar-data");
const travel = JSON.parse(readFileSync(join(forever, "travel.json"), "utf8"));
const files = dataFiles(travel);
for (const f of files) {
	const from = join(clone, f);
	if (!existsSync(from)) { console.error(`missing in the clone: ${f}`); process.exit(1); }
	mkdirSync(dirname(join(dataDir, f)), { recursive: true });
	cpSync(from, join(dataDir, f));
}

// Names: per locale, the pack's Names.lua, the Locales file as L.lua and the three client
// tables in that language from the newest Forever build that holds all of them. A locale
// the clone lacks any of is skipped.
const NAME_LOCALES = ["deDE", "esES", "frFR", "ptBR", "zhCN"];
const NAME_TABLES = ["AreaTable", "UiMap", "SpellName"];
const versionOrder = (x, y) => {
	const a = x.split(".").map(Number), b = y.split(".").map(Number);
	for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0);
	return 0;
};
// The newest cached Forever build (1.6x, as Polestar's wago.js counts them) with the locale's tables, or null.
function localeBuild(wago, locale) {
	if (!existsSync(wago)) return null;
	const builds = readdirSync(wago).filter((b) => /^1\.6\d(\.\d+)+$/.test(b) && NAME_TABLES.every((t) => existsSync(join(wago, b, locale, `${t}.csv`))));
	return builds.sort(versionOrder).at(-1) ?? null;
}
const wagoCache = join(clone, "data", "sources", "wago");
const names = [];
const licences = [];
for (const locale of NAME_LOCALES) {
	const build = localeBuild(wagoCache, locale);
	const addon = join(clone, "addon", `Polestar_Names_${locale}`);
	const wanted = [
		[join(addon, "Names.lua"), "Names.lua"],
		[join(clone, "addon", "Polestar", "Locales", `${locale}.lua`), "L.lua"],
		...NAME_TABLES.map((t) => [build && join(wagoCache, build, locale, `${t}.csv`), `${t}.csv`]),
	];
	const missing = wanted.filter(([from]) => !from || !existsSync(from)).map(([, to]) => to);
	if (missing.length) {
		console.log(`names for ${locale} skipped, missing in the clone: ${missing.join(", ")}${build ? "" : " (no cached Forever build holds its tables)"}`);
		continue;
	}
	mkdirSync(join(dataDir, "names", locale), { recursive: true });
	for (const [from, to] of wanted) cpSync(from, join(dataDir, "names", locale, to));
	names.push(locale);
	if (existsSync(join(addon, "LICENSE-DATA.txt"))) {
		const rule = "=".repeat(72);
		licences.push(`${rule}\n${locale}\n${rule}\n\n${readFileSync(join(addon, "LICENSE-DATA.txt"), "utf8").trimEnd()}\n`);
	}
}
// The packs' licence notes, one after the other (each pack's differs), as names/LICENSE-DATA.txt.
if (licences.length) writeFileSync(join(dataDir, "names", "LICENSE-DATA.txt"), licences.join("\n"));

// Provenance: the clone's commit, its data build's sources (without local paths) and
// whether QuestieDB went into it.
const meta = JSON.parse(readFileSync(join(forever, "meta.json"), "utf8"));
const commit = a.commit || spawnSync("git", ["-C", clone, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout?.trim() || null;
const sources = (meta.sources || []).map(({ dir, ...s }) => s);
// The QuestieDB store itself, not a source that only names it ("quests QuestieDB lacks").
const questie = sources.some((s) => /^QuestieDB\b/.test(s.name));
const manifest = { polestar: { repo: "https://github.com/fitzforge/polestar", commit }, builtAt: meta.builtAt, foreverBuild: travel.foreverBuild, build: travel.build, questie, files, names, levelXp: levelXpOf(clone) };
writeFileSync(join(dataDir, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
writeFileSync(join(dataDir, "sources.json"), JSON.stringify(sources, null, 1) + "\n");

// GPLv3: the licence text from Polestar's own LICENSE (itself GPLv3), and the notice.
const licence = readFileSync(join(clone, "LICENSE"), "utf8");
const at = licence.indexOf("GNU GENERAL PUBLIC LICENSE");
if (at < 0) { console.error(`${clone}/LICENSE holds no GPL text`); process.exit(1); }
writeFileSync(join(dataDir, "LICENSE"), licence.slice(licence.lastIndexOf("\n", at) + 1));
writeFileSync(join(dataDir, "NOTICE.md"), `# Reference data for polestar-convert's web page

This folder holds the game data the converter reads: Polestar's \`data/forever\`
(quests, NPCs, objects, items, zones, map frames, races, travel network,
professions, the codex's dungeon journal) and three client tables (AreaTable,
SpellName, WMOAreaTable), built with Polestar (${manifest.polestar.repo}${commit ? `, commit ${commit}` : ""})
on ${meta.builtAt}.

**Licence.** This data set is distributed under the GNU General Public License,
version 3 (see LICENSE in this folder), because it is derived from
${questie ? "QuestieDB and Questie, whose licence since 2026-10-21 names GPLv3 as the target licence (their maintainers are fine with copying under GPLv3, name and logo excluded; they cannot confirm it for every past contributor), and from " : ""}Polestar (GPLv3). polestar-convert's own code is MIT; this folder is not part of it.
${questie ? "\nIf QuestieDB's licence does not allow it, the set is rebuilt without QuestieDB\n(`polestar data build --no-questie`); the page then says so.\n" : "\n**Built without QuestieDB** (`data build --no-questie`): quests, NPCs and\nitems only Forever has are missing, and converted guides lose them.\n"}
**Sources** (from the data build's meta.json; details in sources.json):

${sources.map((s) => `- ${s.name}${s.url ? ` (${s.url})` : ""}${s.license ? `: ${s.license.split("\n")[0].slice(0, 300)}` : ""}`).join("\n")}

${names.length ? `**Names** (\`names/\`, ${names.join(", ")}): the translated names of Polestar's names packs
(\`Names.lua\`), its Locales files (\`L.lua\`) and the client tables (AreaTable, UiMap, SpellName)
in each language, for the newest Forever build that holds them. The packs' own licence notes
(\`names/LICENSE-DATA.txt\`) name their sources and licences, which differ between the packs (some
parts are MIT, some GPL-3.0); they cover the names, not the rest of this folder.

` : ""}**Source code** to rebuild it: Polestar at the commit above, then

    node tools/polestar.js data build --no-web-xp --no-wowhead
    node tools/polestar.js travel build
    node tools/polestar.js profession build
    node tools/polestar.js codex build
    node <polestar-convert>/tools/pages.mjs --polestar .

World of Warcraft is a trademark of Blizzard Entertainment, Inc. Neither this
data nor polestar-convert is affiliated with or endorsed by Blizzard, Questie,
RestedXP, Journey, Zygor or Polestar.
`);

const size = files.reduce((n, f) => n + readFileSync(join(dataDir, f)).length, 0);
console.log(`wrote ${out}: page, converter, ${files.length} data files (${(size / 1048576).toFixed(1)} MiB, ${questie ? "with" : "without"} QuestieDB)`);
