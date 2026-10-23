// polestar-convert zygor --dir <ZygorGuidesViewerClassic> --polestar <clone> --pack <pack dir> [--only "<guide name or slug>"]
//
// Reads the Classic guides of your own Zygor install (leveling, dungeons, professions,
// reputations, events; for a faction without a full file, the free trial guides the
// viewer ships) and writes `.guide`
// files into a local Polestar pack. Guide text stays in memory; nothing of it is
// written anywhere but the pack.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { convertZygor, readZygor } from "./run.mjs";
import { folderReader } from "../node/read.mjs";
import { loadData } from "../data.mjs";
import { gapReport } from "../core.mjs";

const USAGE = 'usage: polestar-convert zygor --dir <ZygorGuidesViewerClassic folder> --polestar <clone> --pack <pack dir> [--only "<guide name or slug>"]';

export async function run(a) {
	if (!a.dir || !a.polestar || !a.pack) { console.error(USAGE); process.exit(2); }
	const data = await loadData(folderReader(a.polestar));
	const packId = JSON.parse(readFileSync(join(a.pack, "pack.json"), "utf8")).id;
	const guidesDir = join(a.pack, "guides");
	if (!existsSync(guidesDir)) mkdirSync(guidesDir, { recursive: true });

	const lua = await readZygor(folderReader(join(a.dir, "Guides-Classic")));
	const r = convertZygor(lua, data, { packId, only: a.only });
	if (!r.guides.length) { console.error("no guide matches"); process.exit(1); }
	for (const g of r.guides) {
		writeFileSync(join(guidesDir, `${g.slug}.guide`), g.text);
		console.log(`${g.slug}: ${g.stepsIn} Zygor steps -> ${g.stepsOut} steps, pack format ${g.format}`);
	}

	const reportsDir = join(a.pack, "reports");
	if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });
	writeFileSync(join(reportsDir, "zygor-gaps.json"), gapReport("zygor", r));
	const total = Object.values(r.gaps).reduce((n, g) => n + g.length, 0);
	console.log(`gaps: ${total} entries in ${join(reportsDir, "zygor-gaps.json")}`);

	console.log("\n== counts");
	for (const [k, v] of [...r.report.counts].sort((x, y) => y[1] - x[1])) if (v) console.log(String(v).padStart(7), k);
	console.log("\n== needs a look");
	for (const it of r.report.items.slice(0, 80)) console.log(`${it.guide} step ${it.stepNo}: ${it.what}${it.line ? "  [" + String(it.line).slice(0, 90) + "]" : ""}`);
	if (r.report.items.length > 80) console.log(`... and ${r.report.items.length - 80} more`);
}
