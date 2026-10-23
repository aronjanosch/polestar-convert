// polestar-convert --path <WoW folder> [--polestar <clone>] [--pack <dir>] [--routes main,dungeon,survival]
//   [--sources rxp,journey,zygor] [--locales all|none|zhCN,deDE] [--install] [--yes]
//
// One command from a game install to a checked pack: finds the guide addons in the
// client's Interface/AddOns, makes the pack when there is none, converts every guide
// found, lints and (with --install) installs it. Guide text stays in memory and in
// the pack.

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync } from "node:fs";
import { join, resolve, basename, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { createInterface } from "node:readline/promises";
import { loadData } from "../data.mjs";
import { loadNames } from "../journey/names.mjs";
import { findSources, convertAddons, packFiles, runReport, SOURCES, ROUTES } from "../core.mjs";
import { folderReader, levelXpOf, resolveLoose } from "./read.mjs";
import { translateRxp } from "./translate.mjs";

export const PATH_USAGE = `usage: polestar-convert --path <WoW folder> [--polestar <clone>] [--pack <dir>]
         [--routes main,dungeon,survival] [--sources rxp,journey,zygor]
         [--locales all|none|zhCN,deDE] [--install] [--yes]

  --path      the World of Warcraft folder, the Forever client folder in it, or its
              Interface/AddOns (default: the client Polestar finds)
  --polestar  your Polestar clone with its data built (default: $POLESTAR, else ./polestar)
  --pack      the pack to write into; made when missing (default: ./polestar-guides)
  --routes    RestedXP routes to convert (default: asked, or all with --yes)

Convert only guides you have the right to use: free guides, or guides whose
licence allows it. What you convert is your responsibility.
  --sources   guide addons to convert (default: every one found)
  --install   install the pack into the game after a clean lint
  --yes       ask nothing`;

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

function fail(message) {
	console.error(message);
	process.exit(2);
}

// The AddOns folder Polestar's own tools find (tools/lib/addons.js), or null.
function detectedAddons(clone) {
	try {
		return createRequire(import.meta.url)(join(clone, "tools", "lib", "addons.js")).resolveAddonsDir(null);
	} catch {
		return null;
	}
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

const polestar = (clone, args, opts = {}) => spawnSync(process.execPath, [join(clone, "tools", "polestar.js"), ...args], { encoding: "utf8", ...opts });

export async function run(a) {
	const clone = resolve(typeof a.polestar === "string" ? a.polestar : process.env.POLESTAR || "polestar");
	if (!existsSync(join(clone, "tools", "polestar.js"))) fail(`no Polestar clone at ${clone}: pass --polestar <clone> (git clone -b next https://github.com/fitzforge/polestar)`);
	if (!existsSync(join(clone, "data", "forever", "quests.json"))) fail(`${clone} has no game data: run \`node tools/polestar.js data build\` and \`node tools/polestar.js profession build\` in it`);
	const addons = typeof a.path === "string" ? addonsDirOf(a.path) : detectedAddons(clone);
	if (!addons) fail(typeof a.path === "string" ? `no Interface/AddOns at or in ${resolve(a.path)}` : `no Forever client found: pass --path <WoW folder>\n\n${PATH_USAGE}`);

	let sources, routes;
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

	// The pack: made from Polestar's template when missing. The template's example
	// guide hands over to a guide of Polestar's own, which `i18n guides sync` cannot
	// see; a pack made here does not need it.
	const pack = resolve(typeof a.pack === "string" ? a.pack : "polestar-guides");
	if (!existsSync(join(pack, "pack.json"))) {
		const id = basename(pack).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "my-guides";
		const r = polestar(clone, ["new", pack, "--id", id, "--yes"]);
		if (r.status) fail(`polestar new failed:\n${r.stdout}${r.stderr}`);
		rmSync(join(pack, "guides", "example.guide"), { force: true });
		console.log(`made the pack ${pack} (id ${id})`);
	}
	const packId = JSON.parse(readFileSync(join(pack, "pack.json"), "utf8")).id;

	const cloneRead = folderReader(clone);
	const data = await loadData(cloneRead);
	const names = await loadNames(cloneRead, data, levelXpOf(clone));
	const runs = await convertAddons(read, data, names, { packId, sources: found, routes, selfFound: a["self-found"] != null, ah: a.ah, groups: a.groups });
	for (const [path, text] of Object.entries(packFiles(runs))) {
		mkdirSync(dirname(join(pack, path)), { recursive: true });
		writeFileSync(join(pack, path), text);
	}
	mkdirSync(join(pack, "reports"), { recursive: true });
	for (const [source, r] of Object.entries(runs)) {
		writeFileSync(join(pack, "reports", `${source}-run.txt`), runReport(r));
		for (const m of r.missing || []) console.error(`missing: ${m}`);
		const steps = r.guides.reduce((n, g) => n + g.stepsOut, 0);
		console.log(`${SOURCE_NAMES[source]}: ${r.guides.length} guides, ${steps} steps${source === "rxp" ? ` (${routes.join(", ")})` : ""}; ${r.report.items.length} lines need a look (reports/${source}-run.txt)`);
	}

	if (runs.rxp && runs.rxp.guides.length) {
		const root = resolveLoose(addons, "RXPGuides");
		await translateRxp({ want: typeof a.locales === "string" ? a.locales : "all", root, fromList: true, files: runs.rxp.files.map((f) => resolveLoose(root, f.path)), run: runs.rxp, polestar: clone, pack });
	}

	console.log("\nlint ...");
	const lint = polestar(clone, ["lint"], { cwd: pack, maxBuffer: 1 << 30 });
	const out = (lint.stdout + lint.stderr).trim().split("\n");
	const summary = out.find((l) => /^lint (ok|failed)/.test(l)) || out.pop();
	console.log(summary);
	if (lint.status) {
		console.log(`lint found errors: see \`node ${join(clone, "tools", "polestar.js")} lint\` in ${pack}`);
		process.exitCode = 1;
		return;
	}
	console.log("warnings are expected; only errors stop install");
	if (a.install) {
		const r = polestar(clone, ["install"], { cwd: pack, stdio: "inherit" });
		if (r.status) process.exitCode = r.status;
	} else {
		console.log(`\nto install: cd "${pack}" && node "${join(clone, "tools", "polestar.js")}" install   (or run again with --install)`);
	}
}
