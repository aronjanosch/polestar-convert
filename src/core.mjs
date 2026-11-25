// Every guide addon of an AddOns folder in one run, without file access: `read(path)`
// gives a file by its path under Interface/AddOns ("RXPGuides/Guides/GuideList-forever.xml")
// or null. The command line (`--path`) and the web page both run this.

import { convertRxp, guideList } from "./rxp/run.mjs";
import { savedGuides } from "./rxp/saved.mjs";
import { convertJourney } from "./journey/run.mjs";
import { convertZygor, readZygor, ZYGOR_PATHS, ZYGOR_DIRS } from "./zygor/run.mjs";
import { Report } from "./ir.mjs";

export { ROUTES, rxpRoute } from "./rxp/run.mjs";
export const SOURCES = ["rxp", "journey", "zygor"];

const RXP_LIST = "RXPGuides/Guides/GuideList-forever.xml";
const JOURNEY_DIR = "Journey/data/Guides/";
const REPORT_SOURCE = { journey: "Journey (local install)", zygor: "Zygor Guide Viewer (local install)" };

const GUIDE_ADDONS = ["rxpguides", "journey", "zygorguidesviewerforever", "zygorguidesviewerclassic"];
// Client folders by preference: the live client, then the beta Forever ran as.
const CLIENTS = ["_forever_", "_classic_beta_"];

// The files of a picked folder (paths as the browser gives them, the picked folder's
// name first) -> Map(path under Interface/AddOns, lowercased -> index in `paths`).
// The folder may be the World of Warcraft folder (its Forever client is taken), a
// client folder, its Interface folder, the AddOns folder or one addon's folder. Files
// elsewhere are left out (the RXP SavedVariables go through savedVariablePaths).
export function addonsPaths(paths) {
	const lower = paths.map((p) => "/" + String(p).replace(/\\/g, "/").toLowerCase());
	const first = (lower[0] || "/").split("/")[1];
	const isAddon = GUIDE_ADDONS.includes(first) || lower.some((p) => p === `/${first}/${first}.toc`);
	const root = clientRoots(lower)[0];
	const prefix = root == null ? (isAddon ? "/" : `/${first}/`) : root + "/interface/addons/";
	const out = new Map();
	lower.forEach((p, i) => { if (p.startsWith(prefix) && p.length > prefix.length) out.set(p.slice(prefix.length), i); });
	return out;
}

// The client folders of `lower` (paths lowercased, "/" before) that hold an AddOns
// folder: ["/…/_forever_", …], the live Forever client first, then the beta, then the
// rest in the pick's order. No client folder -> null.
function clientRoots(lower) {
	const marker = "/interface/addons/";
	const rank = (root) => CLIENTS.indexOf(root.split("/").pop()) + 1 || 99;
	return [...new Set(lower.filter((p) => p.includes(marker)).map((p) => p.slice(0, p.indexOf(marker))))]
		.sort((a, b) => rank(a) - rank(b));
}

// RXP's SavedVariables file (imported guides, src/rxp/saved.mjs) of a picked folder:
// every account's RXPGuides.lua in the WTF folder of the client whose AddOns the pick
// holds (best-ranked otherwise). -> [{ path, index }] with `path` lowercased, as the
// browser gives it; none when the pick holds no WTF folder (an AddOns pick alone).
export function savedVariablePaths(paths) {
	const lower = paths.map((p) => "/" + String(p).replace(/\\/g, "/").toLowerCase());
	const marker = "/wtf/account/";
	const rank = (root) => CLIENTS.indexOf(root.slice(0, -marker.length).split("/").pop()) + 1 || 99;
	const roots = [...new Set(lower.filter((p) => p.includes(marker)).map((p) => p.slice(0, p.indexOf(marker) + marker.length)))];
	const addonsClient = clientRoots(lower)[0]?.split("/").pop();
	const root = roots.find((r) => addonsClient && r.slice(0, -marker.length).split("/").pop() === addonsClient) || roots.sort((a, b) => rank(a) - rank(b))[0];
	const out = [];
	const accountFile = /^[^/]+\/savedvariables\/rxpguides\.lua$/;
	if (root) lower.forEach((p, i) => { if (p.startsWith(root) && accountFile.test(p.slice(root.length))) out.push({ path: p.slice(1), index: i }); });
	return out;
}

// Whether a WoW addon's TOC depends on RXPGuides (a companion guide addon).
export function isRxpPluginToc(toc) {
	for (const m of String(toc || "").matchAll(/^##\s*(?:Dependencies|RequiredDeps?|Dependency|Deps?|OptionalDeps):\s*(.+)$/gim)) {
		if (m[1].split(/[,\s]+/).some((d) => d.toLowerCase() === "rxpguides")) return true;
	}
	return false;
}

// The files a WoW TOC loads on Forever (`camelot`), normalized to `/` paths.
export function tocFiles(toc) {
	const out = [];
	for (const raw of String(toc || "").split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		const tag = /\s+\[AllowLoadGameType\s+([^\]]+)\]\s*$/i.exec(line);
		if (tag && !tag[1].split(/[,\s]+/).some((g) => g.toLowerCase() === "camelot")) continue;
		const file = (tag ? line.slice(0, tag.index) : line).replace(/\\/g, "/").trim();
		if (file) out.push(file);
	}
	return out;
}

// Candidate companion-addon TOCs from AddOns-relative lowercase paths: `<dir>/<dir>.toc`,
// excluding the built-in guide addons, sorted for deterministic order across CLI and page.
export function rxpPluginTocs(paths) {
	const out = [];
	for (const p of paths || []) {
		const parts = p.split("/");
		if (parts.length !== 2) continue;
		const [dir, file] = parts;
		if (GUIDE_ADDONS.includes(dir) || file !== `${dir}.toc`) continue;
		out.push(p);
	}
	return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function xmlEntries(xml) {
	return [...String(xml).matchAll(/<(?:Script|Include)\s+file="([^"]+)"/gi)].map((m) => m[1].replace(/\\/g, "/"));
}

async function hasRxpPlugin(read, paths) {
	for (const p of rxpPluginTocs(paths)) if (isRxpPluginToc(await read(p))) return true;
	return false;
}

// Lua guide files loaded by companion addons in `paths` whose TOC depends on RXPGuides.
async function rxpPluginFiles(read, paths) {
	const files = [], missing = [], seen = new Set();
	for (const tocPath of rxpPluginTocs(paths)) {
		const toc = await read(tocPath);
		if (!isRxpPluginToc(toc)) continue;
		const dir = tocPath.split("/")[0];
		const queue = tocFiles(toc).map((f) => `${dir}/${f}`);
		const xmlSeen = new Set();
		while (queue.length) {
			const path = queue.shift();
			const lower = path.toLowerCase();
			if (lower.endsWith(".xml")) {
				if (xmlSeen.has(lower)) continue;
				xmlSeen.add(lower);
				const xml = await read(path);
				if (xml == null) { missing.push(path); continue; }
				const base = path.slice(0, path.lastIndexOf("/") + 1);
				queue.unshift(...xmlEntries(xml).map((f) => `${base}${f}`));
			} else if (lower.endsWith(".lua") && !/\/import\.lua$/i.test(lower)) {
				if (seen.has(lower)) continue;
				seen.add(lower);
				const text = await read(path);
				if (text == null) missing.push(path);
				else if (text.includes("RegisterGuide")) files.push({ path, text });
			}
		}
	}
	return { files, missing };
}

// The guide addons the folder holds, of SOURCES, in that order.
export async function findSources(read, paths = []) {
	const found = [];
	if ((await read(RXP_LIST)) != null || (await hasRxpPlugin(read, paths))) found.push("rxp");
	if ((await read(`${JOURNEY_DIR}guides.html`)) != null) found.push("journey");
	if (await zygorDir(read)) found.push("zygor");
	return found;
}

// The first of ZYGOR_DIRS that holds a guide file, or null.
async function zygorDir(read) {
	for (const dir of ZYGOR_DIRS) for (const file of ZYGOR_PATHS) if ((await read(dir + file)) != null) return dir;
	return null;
}

// The `## Version:` of an addon's TOC, without a leading "v", or null.
export function tocVersion(toc) {
	const m = /^## Version:\s*v?(\S+)\s*$/im.exec(toc || "");
	return m ? m[1] : null;
}

// The pack's version from its sources' versions ({ rxp: "4.11.32", ... }): one source's
// as it is, several as "rxp4.11.32+zygor1.6"; "0.1.0" when none is known or Polestar
// would refuse it (one word of letters, digits, ".", "+" and "-", at most 32 long).
export function packVersion(versions) {
	const known = Object.entries(versions).filter(([, v]) => v);
	const v = known.length === 1 ? known[0][1] : known.map(([s, v]) => s + v).join("+");
	return /^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$/.test(v) ? v : "0.1.0";
}

// opts: { packId, sources (default: every one found), routes (RXP), selfFound (RXP),
// ah, groups (Journey), savedVariables (RXP: the RXPGuides.lua of each account, as
// bytes; src/rxp/saved.mjs), progress (called with each source before it runs) }. -> { rxp?, journey?, zygor? }: each source's run; an RXP run
// also lists the files its guide list names but the folder lacks (`missing`); each run
// carries its addon's TOC version (`version`, or null).
export async function convertAddons(read, data, names, opts) {
	const want = opts.sources && opts.sources.length ? opts.sources : SOURCES;
	const found = await findSources(read, opts.paths);
	const runs = {};
	for (const source of SOURCES.filter((s) => want.includes(s) && found.includes(s))) {
		if (opts.progress) await opts.progress(source);
		if (source === "rxp") {
			const files = [], missing = [];
			const listXml = await read(RXP_LIST);
			if (listXml != null) {
				for (const path of guideList(listXml)) {
					const text = await read(`RXPGuides/${path}`);
					if (text == null) missing.push(path);
					else files.push({ path, text });
				}
			}
			const extra = await rxpPluginFiles(read, opts.paths);
			files.push(...extra.files);
			missing.push(...extra.missing);
			// The guides imported in the game (bought ones come this way) RXP keeps in
			// the account's SavedVariables, packed beside the addon's own files; what
			// the report keeps, the run's report carries too.
			const report = new Report();
			files.push(...await savedGuides(opts.savedVariables || [], report));
			runs.rxp = { ...convertRxp(files, data, { packId: opts.packId, routes: opts.routes, selfFound: opts.selfFound, levelXp: names && names.levelXp, spellName: names && names.spell, report }), files, missing };
			let version = tocVersion(await read("RXPGuides/RXPGuides.toc"));
			if (!version) for (const p of rxpPluginTocs(opts.paths)) {
				const toc = await read(p);
				if (isRxpPluginToc(toc)) { version = tocVersion(toc); if (version) break; }
			}
			runs.rxp.version = version;
		}
		if (source === "journey") {
			runs.journey = await convertJourney((name) => read(JOURNEY_DIR + name), data, names, { packId: opts.packId, ah: opts.ah, groups: opts.groups });
			runs.journey.version = tocVersion(await read("Journey/Journey.toc"));
		}
		if (source === "zygor") {
			const dir = await zygorDir(read);
			runs.zygor = convertZygor(await readZygor((path) => read(dir + path)), data, { packId: opts.packId });
			const folder = dir.split("/")[0];
			runs.zygor.version = tocVersion(await read(`${folder}/${folder}.toc`));
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
