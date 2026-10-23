// Every guide addon of an AddOns folder in one run, without file access: `read(path)`
// gives a file by its path under Interface/AddOns ("RXPGuides/Guides/GuideList-forever.xml")
// or null. The command line (`--path`) and the web page both run this.

import { convertRxp, guideList } from "./rxp/run.mjs";
import { convertJourney } from "./journey/run.mjs";
import { convertZygor, ZYGOR_FILES } from "./zygor/run.mjs";

export { ROUTES, rxpRoute } from "./rxp/run.mjs";
export const SOURCES = ["rxp", "journey", "zygor"];

const RXP_LIST = "RXPGuides/Guides/GuideList-forever.xml";
const JOURNEY_DIR = "Journey/data/Guides/";
const ZYGOR_DIR = "ZygorGuidesViewerClassic/Guides-Classic/Leveling/";
const REPORT_SOURCE = { journey: "Journey (local install)", zygor: "Zygor Guide Viewer Classic (local install)" };

// The guide addons the folder holds, of SOURCES, in that order.
export async function findSources(read) {
	const found = [];
	if ((await read(RXP_LIST)) != null) found.push("rxp");
	if ((await read(`${JOURNEY_DIR}guides.html`)) != null) found.push("journey");
	if ((await read(ZYGOR_DIR + ZYGOR_FILES.horde)) != null || (await read(ZYGOR_DIR + ZYGOR_FILES.alliance)) != null) found.push("zygor");
	return found;
}

// opts: { packId, sources (default: every one found), routes (RXP), selfFound (RXP),
// ah, groups (Journey) }. -> { rxp?, journey?, zygor? }: each source's run; an RXP run
// also lists the files its guide list names but the folder lacks (`missing`).
export async function convertAddons(read, data, names, opts) {
	const want = opts.sources && opts.sources.length ? opts.sources : SOURCES;
	const found = await findSources(read);
	const runs = {};
	for (const source of SOURCES.filter((s) => want.includes(s) && found.includes(s))) {
		if (source === "rxp") {
			const files = [], missing = [];
			for (const path of guideList(await read(RXP_LIST))) {
				const text = await read(`RXPGuides/${path}`);
				if (text == null) missing.push(path);
				else files.push({ path, text });
			}
			runs.rxp = { ...convertRxp(files, data, { packId: opts.packId, routes: opts.routes, selfFound: opts.selfFound }), files, missing };
		}
		if (source === "journey") runs.journey = await convertJourney((name) => read(JOURNEY_DIR + name), data, names, { packId: opts.packId, ah: opts.ah, groups: opts.groups });
		if (source === "zygor") {
			const lua = {};
			for (const [side, file] of Object.entries(ZYGOR_FILES)) lua[side] = (await read(ZYGOR_DIR + file)) || "";
			runs.zygor = convertZygor(lua, data, { packId: opts.packId });
		}
	}
	return runs;
}

// A source's gap report, as the pack keeps it under reports/.
export function gapReport(source, run) {
	return JSON.stringify({ source: REPORT_SOURCE[source], settings: run.settings, guides: run.gaps }, null, 1) + "\n";
}

// The files the runs add to a pack, by their path in it: guides/<slug>.guide and the
// Journey and Zygor gap reports.
export function packFiles(runs) {
	const files = {};
	for (const [source, run] of Object.entries(runs)) {
		for (const g of run.guides) files[`guides/${g.slug}.guide`] = g.text;
		if (run.gaps && run.guides.length) files[`reports/${source}-gaps.json`] = gapReport(source, run);
	}
	return files;
}
