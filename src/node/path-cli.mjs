// polestar-convert --path <WoW folder> [--routes main,dungeon,survival] [--sources rxp,journey,zygor]
//   [--locales all|none|zhCN,deDE] [--name "My Guides"] [--install | --out <dir>] [--yes]
//
// One command from a game install to the addon folders Polestar loads, as the web page
// makes them (src/build.mjs): finds the guide addons in the client's Interface/AddOns,
// converts every guide found, compiles with Polestar's compiler and writes the folders
// into the AddOns folder (--install) or a folder of your choice. The game data and the
// compiler come from the web page's site and are kept in a cache; no Polestar clone.

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync } from "node:fs";
import { join, resolve, basename, dirname } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";
import { findSources, runReport, SOURCES, ROUTES } from "../core.mjs";
import { buildAddons } from "../build.mjs";
import { addonEntries } from "../addon.mjs";
import { packIdProblem } from "../pack.mjs";
import { rxpLocales } from "../rxp/translations.mjs";
import { folderReader, resolveLoose } from "./read.mjs";

export const PATH_USAGE = `usage: polestar-convert --path <WoW folder> [--routes main,dungeon,survival]
         [--sources rxp,journey,zygor] [--locales all|none|zhCN,deDE] [--name "My Guides"]
         [--install | --out <dir>] [--yes]

  --path      the World of Warcraft folder, the Forever client folder in it, or its
              Interface/AddOns
  --routes    RestedXP routes to convert (default: asked, or all with --yes)
  --sources   guide addons to convert (default: every one found)
  --locales   RestedXP's languages to add (default: all it ships)
  --name      the addon's name in Polestar (default: My Guides)
  --install   write the addon folders into the AddOns folder
  --out       write them into this folder instead (default: ./polestar-addon)
  --yes       ask nothing

Convert only guides you have the right to use: free guides, or guides whose
licence allows it. What you convert is your responsibility.`;

const SITE = "https://aronjanosch.github.io/polestar-convert/";
const SOURCE_NAMES = { rxp: "RestedXP", journey: "Journey", zygor: "Zygor" };
const GUIDE_ADDONS = ["RXPGuides", "Journey", "ZygorGuidesViewerClassic"];
// Client folders by preference: the live client, then the beta Forever ran as.
const CLIENTS = ["_forever_", "_classic_beta_"];

const isDir = (p) => statSync(p, { throwIfNoEntry: false })?.isDirectory() || false;
const hasGuides = (addons) => GUIDE_ADDONS.some((a) => resolveLoose(addons, a));

// The AddOns folder `path` names: itself, its Interface/AddOns (a client folder),
// or a client's in it (the World of Warcraft folder: the first client holding a
// guide addon, _forever_ before _classic_beta_ before the rest). -> path or null.
export function addonsDirOf(path) {
	const p = resolve(path);
	if (!isDir(p)) return null;
	if (/^addons$/i.test(basename(p))) return p;
	const own = resolveLoose(p, "Interface/AddOns");
	if (own && isDir(own)) return own;
	const clients = readdirSync(p).filter((n) => /^_.+_$/.test(n))
		.sort((a, b) => (CLIENTS.indexOf(a) + 1 || 99) - (CLIENTS.indexOf(b) + 1 || 99))
		.map((n) => resolveLoose(join(p, n), "Interface/AddOns")).filter((d) => d && isDir(d));
	return clients.find(hasGuides) || null;
}

// "main, Survival" -> ["main", "survival"]; "all" -> every allowed; unset -> null.
// `aliases`: older names taken for an allowed one.
export function listArg(text, allowed, flag, aliases = {}) {
	if (text == null || text === true) return null;
	if (String(text).trim().toLowerCase() === "all") return [...allowed];
	const list = String(text).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).map((s) => aliases[s] || s);
	for (const it of list) if (!allowed.includes(it)) throw new Error(`${flag}: unknown "${it}" (${allowed.join(", ")})`);
	return [...new Set(list)];
}

// "My Guides" -> "my-guides", as a pack id Polestar takes.
export function idOf(name) {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "my-guides";
}

function fail(message) {
	console.error(message);
	process.exit(2);
}

async function askRoutes() {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try {
		for (;;) {
			const answer = await rl.question(`RestedXP routes to convert (${ROUTES.join(", ")}; Enter: all): `);
			try {
				return listArg(answer.trim() || "all", ROUTES, "routes");
			} catch (e) {
				console.log(e.message);
			}
		}
	} finally {
		rl.close();
	}
}

// The site's files: a local copy of the page (`--site <dir>`, for testing) or the web,
// fetched once per data version into the cache. -> { file(path, version): its local
// path, or null when the site has none }
function siteReader(site) {
	if (!/^https?:/.test(site)) return { file: async (p) => (existsSync(join(site, p)) ? join(site, p) : null) };
	const cache = join(process.env.XDG_CACHE_HOME || (process.platform === "win32" && process.env.LOCALAPPDATA) || join(homedir(), ".cache"), "polestar-convert");
	return {
		file: async (p, version = "latest") => {
			const file = join(cache, version, p);
			if (version !== "latest" && existsSync(file)) return file;
			const r = await fetch(new URL(p, site));
			if (r.status === 404) return null;
			if (!r.ok) throw new Error(`${new URL(p, site)}: ${r.status}`);
			mkdirSync(dirname(file), { recursive: true });
			writeFileSync(file, Buffer.from(await r.arrayBuffer()));
			return file;
		},
	};
}

// Every file under the guide addons, as AddOns-relative lowercase paths.
function guidePaths(addons) {
	const out = [];
	for (const a of GUIDE_ADDONS) {
		const dir = resolveLoose(addons, a);
		if (!dir) continue;
		for (const rel of readdirSync(dir, { recursive: true })) if (!isDir(join(dir, rel))) out.push(`${basename(dir)}/${rel}`.replace(/\\/g, "/").toLowerCase());
	}
	return out;
}

// A folder this tool wrote for the pack: its TOC names the pack (or its texts).
function ours(dir, id) {
	const toc = join(dir, `${basename(dir)}.toc`);
	return existsSync(toc) && new RegExp(`^## X-Polestar-(Pack|Texts): ${id}\\s*$`, "m").test(readFileSync(toc, "utf8"));
}

export async function run(a) {
	if (typeof a.path !== "string") fail(PATH_USAGE);
	const addons = addonsDirOf(a.path);
	if (!addons) fail(`no Interface/AddOns at or in ${resolve(a.path)}`);
	const name = typeof a.name === "string" ? a.name.trim() : "My Guides";
	const pack = { id: idOf(name), title: name, author: "Me" };
	if (packIdProblem(pack.id)) fail(`--name: ${packIdProblem(pack.id)}`);

	let sources, routes, locales;
	try {
		sources = listArg(a.sources, SOURCES, "--sources") || SOURCES;
		routes = listArg(a.routes, ROUTES, "--routes");
	} catch (e) { fail(e.message); }
	console.log("Convert only guides you have the right to use; what you convert is your responsibility.");
	const read = folderReader(addons);
	const found = (await findSources(read)).filter((s) => sources.includes(s));
	if (!found.length) fail(`no guide addon (${GUIDE_ADDONS.join(", ")}) in ${addons}`);
	console.log(`${addons}: ${found.map((s) => SOURCE_NAMES[s]).join(", ")}`);
	if (found.includes("rxp") && !routes) routes = a.yes || !process.stdin.isTTY ? [...ROUTES] : await askRoutes();

	// The game data and the compiler, as the page has them.
	const site = siteReader(typeof a.site === "string" ? (/^https?:/.test(a.site) ? a.site.replace(/\/?$/, "/") : resolve(a.site)) : SITE);
	const manifest = JSON.parse(readFileSync(await site.file("polestar-data/manifest.json"), "utf8"));
	const version = `${manifest.polestar.commit ?? "unknown"}-${String(manifest.builtAt).replace(/[^0-9A-Za-z]/g, "")}`;
	const have = new Set(manifest.files);
	const readData = async (p) => {
		const file = have.has(p) ? await site.file(`polestar-data/${p}`, version) : null;
		return file && readFileSync(file, "utf8");
	};
	const forge = (f) => site.file(`forge/${f}`, version);
	const module = await import(pathToFileURL(await forge("polestar_convert_wasm.js")));
	await module.default({ module_or_path: readFileSync(await forge("polestar_convert_wasm_bg.wasm")) });

	const paths = guidePaths(addons);
	try {
		const shipped = rxpLocales(paths).filter((l) => (manifest.names || []).includes(l));
		locales = typeof a.locales === "string" ? (a.locales === "none" ? [] : listArg(a.locales, shipped.map((l) => l.toLowerCase()), "--locales").map((l) => shipped.find((s) => s.toLowerCase() === l))) : shipped;
	} catch (e) { fail(e.message); }

	const r = await buildAddons({ read, paths, readData, manifest, Compiler: module.Compiler, pack, opts: { sources: found, routes, selfFound: a["self-found"] != null, ah: a.ah, groups: a.groups }, locales, say: (t) => console.log(t) });
	const reports = resolve(a.install ? "polestar-convert-reports" : join(typeof a.out === "string" ? a.out : "polestar-addon", "reports"));
	mkdirSync(reports, { recursive: true });
	for (const [source, run] of Object.entries(r.runs)) {
		writeFileSync(join(reports, `${source}-run.txt`), runReport(run));
		for (const m of run.missing || []) console.error(`missing: ${m}`);
		const steps = run.guides.reduce((n, g) => n + g.stepsOut, 0);
		console.log(`${SOURCE_NAMES[source]}: ${run.guides.length} guides, ${steps} steps${source === "rxp" ? ` (${routes.join(", ")})` : ""}; ${run.report.items.length} lines need a look (${join(reports, `${source}-run.txt`)})`);
	}
	if (r.errors) {
		for (const e of r.errors.slice(0, 50)) console.error(`${e.file}${e.line ? `:${e.line}` : ""}: ${e.message}`);
		fail(`Polestar's compiler found ${r.errors.length} errors: no addon written`);
	}
	// Per language: the counts, why texts did not pair (all guides) and each guide's.
	const pairing = (t) => {
		const sum = {};
		for (const rep of t.pairing.values()) for (const [k, v] of rep.counts) sum[k] = (sum[k] ?? 0) + v;
		return sum;
	};
	writeFileSync(join(reports, "rxp-locales.json"), JSON.stringify({ locales: Object.fromEntries(Object.entries(r.translated).map(([l, t]) => [l, { ...t.counts, pairing: pairing(t), guides: t.guides }])) }, null, 1) + "\n");
	for (const [l, t] of Object.entries(r.translated)) {
		const total = Object.values(t.counts).reduce((n, v) => n + v, 0);
		console.log(`${l}: ${t.counts.translated} of ${total} texts translated, ${t.counts["partly translated"]} in part`);
	}
	if (r.skipped.length) console.log(`${r.skipped.length} translations Polestar would refuse were left out (English stays)`);
	console.log(`${r.warnings} compiler warnings: they do not stop the addon`);

	// The folders: into the AddOns folder, replacing only folders this tool wrote for the pack.
	const into = a.install ? addons : resolve(typeof a.out === "string" ? a.out : "polestar-addon");
	const entries = addonEntries(r.folder, r.files);
	for (const folder of new Set(Object.keys(entries).map((p) => p.split("/")[0]))) {
		const dir = join(into, folder);
		if (existsSync(dir) && !ours(dir, pack.id)) fail(`${dir} exists and is not this tool's addon for "${name}": move it away or pick another --name`);
		rmSync(dir, { recursive: true, force: true });
	}
	for (const [p, content] of Object.entries(entries)) {
		mkdirSync(dirname(join(into, p)), { recursive: true });
		writeFileSync(join(into, p), content);
	}
	console.log(a.install
		? `\ninstalled ${r.folder} into ${addons}: restart the game completely; the guides show in Polestar's hub (/polestar guides) under Community guides`
		: `\nwrote ${r.folder} into ${into}: copy its folders into ${addons} (or run again with --install)`);
}
