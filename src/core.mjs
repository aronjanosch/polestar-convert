// Every guide addon of an AddOns folder in one run, without file access: `read(path)`
// gives a file by its path under Interface/AddOns ("RXPGuides/Guides/GuideList-forever.xml")
// or null. The command line (`--path`) and the web page both run this.

import { convertRxp, guideList } from "./rxp/run.mjs";
import { convertJourney } from "./journey/run.mjs";
import { convertZygor, readZygor, ZYGOR_PATHS } from "./zygor/run.mjs";

export { ROUTES, rxpRoute } from "./rxp/run.mjs";
export const SOURCES = ["rxp", "journey", "zygor"];

const RXP_LIST = "RXPGuides/Guides/GuideList-forever.xml";
const JOURNEY_DIR = "Journey/data/Guides/";
const ZYGOR_DIR = "ZygorGuidesViewerClassic/Guides-Classic/";
const REPORT_SOURCE = { journey: "Journey (local install)", zygor: "Zygor Guide Viewer Classic (local install)" };

const GUIDE_ADDONS = ["rxpguides", "journey", "zygorguidesviewerclassic"];
// Client folders by preference: the live client, then the beta Forever ran as.
const CLIENTS = ["_forever_", "_classic_beta_"];

// The files of a picked folder (paths as the browser gives them, the picked folder's
// name first) -> Map(path under Interface/AddOns, lowercased -> index in `paths`).
// The folder may be the World of Warcraft folder (its Forever client is taken), a
// client folder, its Interface folder, the AddOns folder or one addon's folder. Files
// elsewhere are left out.
export function addonsPaths(paths) {
	const lower = paths.map((p) => "/" + p.replace(/\\/g, "/").toLowerCase());
	const marker = "/interface/addons/";
	const prefixes = [...new Set(lower.filter((p) => p.includes(marker)).map((p) => p.slice(0, p.indexOf(marker) + marker.length)))];
	const rank = (prefix) => {
		const client = prefix.split("/").slice(-4, -3)[0];
		return CLIENTS.indexOf(client) + 1 || 99;
	};
	const first = (lower[0] || "/").split("/")[1];
	const prefix = prefixes.sort((a, b) => rank(a) - rank(b))[0] ?? (GUIDE_ADDONS.includes(first) ? "/" : `/${first}/`);
	const out = new Map();
	lower.forEach((p, i) => { if (p.startsWith(prefix) && p.length > prefix.length) out.set(p.slice(prefix.length), i); });
	return out;
}

// The guide addons the folder holds, of SOURCES, in that order.
export async function findSources(read) {
	const found = [];
	if ((await read(RXP_LIST)) != null) found.push("rxp");
	if ((await read(`${JOURNEY_DIR}guides.html`)) != null) found.push("journey");
	for (const file of ZYGOR_PATHS) {
		if ((await read(ZYGOR_DIR + file)) != null) { found.push("zygor"); break; }
	}
	return found;
}

// opts: { packId, sources (default: every one found), routes (RXP), selfFound (RXP),
// ah, groups (Journey), progress (called with each source before it runs) }. -> { rxp?, journey?, zygor? }: each source's run; an RXP run
// also lists the files its guide list names but the folder lacks (`missing`).
export async function convertAddons(read, data, names, opts) {
	const want = opts.sources && opts.sources.length ? opts.sources : SOURCES;
	const found = await findSources(read);
	const runs = {};
	for (const source of SOURCES.filter((s) => want.includes(s) && found.includes(s))) {
		if (opts.progress) await opts.progress(source);
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
			runs.zygor = convertZygor(await readZygor((path) => read(ZYGOR_DIR + path)), data, { packId: opts.packId });
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

// A run's counts and the lines that need a look, as the single commands print them.
export function runReport(run) {
	const out = ["== counts"];
	for (const [k, v] of [...run.report.counts].sort((x, y) => y[1] - x[1])) if (v) out.push(`${String(v).padStart(7)} ${k}`);
	out.push("", "== needs a look");
	for (const it of run.report.items) out.push(`${it.guide ? it.guide + " " : ""}step ${it.stepNo}: ${it.what}${it.line ? "  [" + String(it.line).slice(0, 90) + "]" : ""}`);
	return out.join("\n") + "\n";
}
