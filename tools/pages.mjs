#!/usr/bin/env node
// Builds the web page for GitHub Pages: web/ and the converter's src/ as they are,
// and polestar-data/, the reference data the converter reads, copied from a
// Polestar clone with its data built. That data set is published under GPLv3 (it
// holds QuestieDB facts) with a notice of its sources; the code stays MIT.
//
// Usage: node tools/pages.mjs --polestar <clone> [--out <dir>] [--commit <sha>]   (default out/pages;
// --commit names Polestar's commit when the clone is a copy without git)
// For a data set without QuestieDB (the fallback should its contributors object),
// build the clone's data with `data build --no-questie` and run this on that clone:
// the page then says the Forever-only quests are missing.

import { mkdirSync, rmSync, cpSync, readFileSync, writeFileSync, existsSync } from "node:fs";
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
// The converter as the page imports it; the Node-only modules stay out.
cpSync(join(repo, "src"), join(out, "src"), { recursive: true, filter: (p) => !p.includes(`${join("src", "node")}`) && !/[\\/]cli\.mjs$/.test(p) && !p.includes(join("src", "i18n")) });
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

// Provenance: the clone's commit, its data build's sources (without local paths) and
// whether QuestieDB went into it.
const meta = JSON.parse(readFileSync(join(forever, "meta.json"), "utf8"));
const commit = a.commit || spawnSync("git", ["-C", clone, "rev-parse", "HEAD"], { encoding: "utf8" }).stdout?.trim() || null;
const sources = (meta.sources || []).map(({ dir, ...s }) => s);
// The QuestieDB store itself, not a source that only names it ("quests QuestieDB lacks").
const questie = sources.some((s) => /^QuestieDB\b/.test(s.name));
const manifest = { polestar: { repo: "https://github.com/fitzforge/polestar", commit }, builtAt: meta.builtAt, foreverBuild: travel.foreverBuild, build: travel.build, questie, files, levelXp: levelXpOf(clone) };
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
${questie ? "QuestieDB and Questie, whose maintainers licence their work under GPLv3 since 2026-10-21 (\"alright with others forking the repository or copying code from it under the GPLv3 terms\"; name and logo excluded), and from " : ""}Polestar (GPLv3). polestar-convert's own code is MIT; this folder is not part of it.
${questie ? "\nShould QuestieDB's contributors object, the set is rebuilt without QuestieDB\n(`polestar data build --no-questie`); the page then says so.\n" : "\n**Built without QuestieDB** (`data build --no-questie`): quests, NPCs and\nitems only Forever has are missing, and converted guides lose them.\n"}
**Sources** (from the data build's meta.json; details in sources.json):

${sources.map((s) => `- ${s.name}${s.url ? ` (${s.url})` : ""}${s.license ? `: ${s.license.split("\n")[0].slice(0, 300)}` : ""}`).join("\n")}

**Source code** to rebuild it: Polestar at the commit above, then

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
