// polestar-convert journey --dir <Journey addon> --polestar <clone> --pack <pack dir> [--only "<description or guideID>"] [--max-start N] [--ah no] [--groups no]
//
// Reads the guides of your own Journey install and writes `.guide` files into a
// local Polestar pack. Decoded guide text stays in memory; nothing of it is
// written anywhere but the pack.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { convertJourney } from "./run.mjs";
import { loadNames } from "./names.mjs";
import { loadData } from "../data.mjs";
import { gapReport } from "../core.mjs";
import { folderReader, levelXpOf } from "../node/read.mjs";

const USAGE = 'usage: polestar-convert journey --dir <Journey addon folder> --polestar <clone> --pack <pack dir> [--only "<description or guideID>"] [--max-start N] [--ah no] [--groups no]';

export async function run(a) {
	if (!a.dir || !a.polestar || !a.pack) { console.error(USAGE); process.exit(2); }
	const clone = folderReader(a.polestar);
	const data = await loadData(clone);
	const names = await loadNames(clone, data, levelXpOf(a.polestar));
	const packId = JSON.parse(readFileSync(join(a.pack, "pack.json"), "utf8")).id;
	const guidesDir = join(a.pack, "guides");
	if (!existsSync(guidesDir)) mkdirSync(guidesDir, { recursive: true });

	const r = await convertJourney(folderReader(join(a.dir, "data", "Guides")), data, names, { packId, only: a.only, maxStart: a["max-start"], ah: a.ah, groups: a.groups });
	if (!r.guides.length) { console.error("no guide matches"); process.exit(1); }
	for (const g of r.guides) {
		writeFileSync(join(guidesDir, `${g.slug}.guide`), g.text);
		console.log(`${g.slug}: ${g.stepsIn} Journey steps -> ${g.stepsOut} steps, pack format ${g.format}`);
	}

	const reportsDir = join(a.pack, "reports");
	if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
	writeFileSync(join(reportsDir, "journey-gaps.json"), gapReport("journey", r));
	const total = Object.values(r.gaps).reduce((n, g) => n + g.length, 0);
	console.log(`gaps: ${total} entries in ${join(reportsDir, "journey-gaps.json")}`);

	console.log("\n== counts");
	for (const [k, v] of [...r.report.counts].sort((x, y) => y[1] - x[1])) if (v) console.log(String(v).padStart(5), k);
	console.log("\n== needs a look");
	for (const it of r.report.items.slice(0, 80)) console.log(`${it.guide} step ${it.stepNo}: ${it.what}${it.line ? "  [" + String(it.line).slice(0, 90) + "]" : ""}`);
	if (r.report.items.length > 80) console.log(`... and ${r.report.items.length - 80} more`);
}
