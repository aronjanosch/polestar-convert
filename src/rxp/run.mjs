// A whole RestedXP run without file access: the guide files' text in, the
// `.guide` texts out. The command line and the web page both run this.

import { extractGuides, parseGuide } from "./parse.mjs";
import { convertGuide, spellNames } from "./convert.mjs";
import { planChain, expandIncludes } from "./chain.mjs";
import { Report } from "../ir.mjs";

// RXP's guide list holds parallel routes; a player runs one.
export const ROUTES = ["main", "dungeon", "survival"];
// Route names of 0.2.0, still taken.
export const ROUTE_ALIASES = { main: "main", mage: "main" };

// The route a guide belongs to, by its `#group`: the dungeon route with the dungeon
// quest guides, the survival route, and the main route for the rest.
export function rxpRoute(header) {
	const group = String(header.group || "");
	if (/\bSurvival\b/i.test(group)) return "survival";
	if (/\bDungeon\b/i.test(group)) return "dungeon";
	return "main";
}

// The guide files RXP's guide list (GuideList-forever.xml) loads, in its order, as it
// writes them (relative to the RXPGuides folder); Import.lua holds no guide.
export function guideList(xml) {
	return [...String(xml).matchAll(/<Script file="([^"]+)"/g)].map((m) => m[1]).filter((f) => !/Import\.lua$/i.test(f));
}

// files: [{ path, text }] in the guide list's order, so a chain runs across files.
// opts: { packId, only, maxStart, selfFound, routes }.
// -> { guides: [{ slug, text, stepsIn, stepsOut, format, route }], report,
//      rawByFile, written, convert } (the last three for the translations).
export function convertRxp(files, data, opts) {
	const report = new Report();
	// The guides of each file as parsed: a translated file pairs with its English one guide by guide.
	const rawByFile = files.map((f) => extractGuides(f.text).map(parseGuide));
	const parsed = expandIncludes(rawByFile.flat(), report);
	// Spell names for `cast`, from every guide's lines that cast them.
	const spells = spellNames(parsed);
	// Slugs, hand-offs and the quests taken on the way in come from the whole file,
	// so a guide picked alone still knows what the guides before it accept.
	const plan = planChain(parsed, report);
	// `en`: the English guide whose plan a translated one takes.
	const convert = (g, rep, next, en = g) => convertGuide(g, data, { report: rep, slug: plan.slug.get(en), packId: opts.packId, next, before: plan.before.get(en), spells, selfFound: !!opts.selfFound });
	// A first pass with a report of its own: a guide left with no steps (every step a
	// variant left out) is not written, nor one past `maxStart`.
	const keep = (g) => {
		const r = convert(g, new Report(), []);
		if (!r.stepsOut) { report.count("guide with no steps left (not written)"); return false; }
		if (opts.maxStart == null) return true;
		const lo = Number(String(r.levels || "").split("-")[0]);
		return lo > 0 && lo <= Number(opts.maxStart);
	};
	const routes = opts.routes && opts.routes.length ? new Set(opts.routes.map((r) => ROUTE_ALIASES[r] || r)) : null;
	const chosen = parsed.filter((g) => !plan.hidden.has(g) && (!opts.only || (g.header.name || "") === opts.only) && (!routes || routes.has(rxpRoute(g.header))) && keep(g));
	const kept = new Set(chosen);

	const guides = [], written = [];
	for (const g of chosen) {
		const slug = plan.slug.get(g);
		// A hand-off to a guide this run does not write would point nowhere.
		const next = plan.next.get(g).filter((n) => kept.has(n)).map((n) => plan.slug.get(n));
		const r = convert(g, report, next);
		guides.push({ slug, text: r.text, stepsIn: r.stepsIn, stepsOut: r.stepsOut, format: r.format, route: rxpRoute(g.header) });
		written.push({ at: parsed.indexOf(g), slug, text: r.text, next, g });
	}
	return { guides, report, rawByFile, written, convert };
}
