#!/usr/bin/env node
// polestar-convert --path <WoW folder> [--routes ...] [--locales ...] [--install]   (every guide addon found, to the addon folders; src/node/path-cli.mjs)
// polestar-convert journey --dir <Journey> --polestar <clone> --pack <pack dir> [...]
// polestar-convert zygor --dir <ZygorGuidesViewerClassic> --polestar <clone> --pack <pack dir> [--only "<guide>"]
// polestar-convert rxp --file <RXP guide .lua> | --list <GuideList-forever.xml> --polestar <clone> --pack <pack dir> [--only "<name>"] [--max-start N] [--self-found yes]
//
// Reads guides you own from your own install. --path makes the addon folders; the
// single commands write `.guide` files into a Polestar pack, for working on the
// converter with Polestar's tools. It carries no guide content of its own.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { convertRxp, guideList } from "../src/rxp/run.mjs";
import { loadData } from "../src/data.mjs";
import { folderReader, resolveLoose } from "../src/node/read.mjs";

function args(argv) {
	const out = { _: [] };
	for (let i = 0; i < argv.length; i++) {
		// A flag with no value after it (`--install`, `--yes`) is true.
		if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[i + 1] == null || argv[i + 1].startsWith("--") ? true : argv[++i];
		else out._.push(argv[i]);
	}
	return out;
}

const a = args(process.argv.slice(2));
const [cmd] = a._;
if (!cmd && a.path !== undefined) {
	await (await import("../src/node/path-cli.mjs")).run(a);
	process.exit(process.exitCode ?? 0);
}
if (!cmd && !Object.keys(a).some((k) => k !== "_")) {
	const { PATH_USAGE } = await import("../src/node/path-cli.mjs");
	console.error(`${PATH_USAGE}\n\nor one addon at a time: polestar-convert rxp|journey|zygor ... (see the README)`);
	process.exit(2);
}
if (cmd === "journey") {
	await (await import("../src/journey/cli.mjs")).run(a);
	process.exit(0);
}
if (cmd === "zygor") {
	await (await import("../src/zygor/cli.mjs")).run(a);
	process.exit(0);
}
if (cmd !== "rxp" || !(a.file || a.list) || !a.polestar || !a.pack) {
	console.error('usage: polestar-convert rxp --file <guide.lua> | --list <RXPGuides/Guides/GuideList-forever.xml> --polestar <clone> --pack <pack dir> [--only "<guide name>"] [--max-start N] [--self-found yes]');
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
const { guides, report } = convertRxp(files.map((f) => ({ path: f, text: readFileSync(f, "utf8") })), data,
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
