// A whole Journey run without file access: `read(name)` gives a file of the
// addon's data/Guides folder ("guides.html", "0001.html") or null; the `.guide`
// texts and the gap report come out. Decoded guide text stays in memory.

import { decodeSlot, parseLua, parseCatalog } from "./parse.mjs";
import { convertGuide } from "./convert.mjs";
import { Report } from "../ir.mjs";

// "H06TG" (a jump button's guide) -> the catalog's "H06TG_FVR".
function catalogId(catalog, id) {
	return (catalog.find((e) => e.guideID === id) || catalog.find((e) => e.guideID.startsWith(id + "_")) || {}).guideID || null;
}
const slugOf = (e) => `${e.guideID.replace(/_FVR$/, "").toLowerCase()}-${String(e.description || "").replace(/^\d+-\d+\s+/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

// opts: { packId, only, maxStart, ah, groups } (ah, groups: "no" turns them off; groups
// unset: asked per quest in Polestar).
// -> { guides: [{ slug, text, stepsIn, stepsOut, format }], gaps, settings, report }
export async function convertJourney(read, data, names, opts) {
	const { packId } = opts;
	// Grouping: asked per quest in Polestar unless the caller fixes it.
	const fixed = { AH: opts.ah !== "no", ...(opts.groups ? { GROUPS: opts.groups !== "no" } : {}) };
	const catalog = parseCatalog(decodeSlot(await read("guides.html")));
	const slotText = new Map();
	for (const e of catalog) {
		const f = `${String(e.slot).padStart(4, "0")}.html`;
		if (slotText.has(f)) continue;
		const html = await read(f);
		slotText.set(f, html == null ? null : parseLua(decodeSlot(html)));
	}
	const guideOf = (e) => slotText.get(`${String(e.slot).padStart(4, "0")}.html`);
	const entries = catalog.filter((e) => guideOf(e));

	// Pass 1, each guide alone: what it accepts, where its buttons lead, whether
	// anything is left of it.
	const first = new Map();
	for (const e of entries) {
		const r = convertGuide(e, guideOf(e), data, { report: new Report(), slug: slugOf(e), packId, names, fixed });
		first.set(e.guideID, r);
	}
	// The guides each one hands off to (its jump buttons naming another guide) and,
	// from those, every guide before it in the chain.
	const nextIds = new Map(entries.map((e) => [e.guideID, first.get(e.guideID).jumps.map((j) => catalogId(catalog, j)).filter((id) => id && id !== e.guideID)]));
	const before = new Map();
	const prevOf = (id) => entries.filter((e) => (nextIds.get(e.guideID) || []).includes(id)).map((e) => e.guideID);
	for (const e of entries) {
		const seen = new Set();
		const todo = prevOf(e.guideID);
		while (todo.length) { const p = todo.pop(); if (seen.has(p)) continue; seen.add(p); todo.push(...prevOf(p)); }
		const q = new Set();
		for (const p of seen) for (const id of first.get(p).accepted) q.add(id);
		before.set(e.guideID, q);
	}

	const real = (r) => r.text.split("\n").some((l) => /^ {2}(accept|turnin|kill|collect|complete|interact|level|vendor|train|buy|getfp|fly|sethome)\b/.test(l));
	const startOf = (e) => Number(String(e.levels || "").split("-")[0]);
	const report = new Report();
	// What each guide does not carry, by Journey step id (like rxp-free-guides' reports/).
	const gaps = {}, guides = [];
	const only = opts.only;
	const chosen = entries.filter((e) => {
		if (only && e.description !== only && e.guideID !== only && e.guideID !== only + "_FVR") return false;
		if (!real(first.get(e.guideID))) { report.count("guide with nothing to do (placeholder, not written)"); return false; }
		return opts.maxStart == null || startOf(e) <= Number(opts.maxStart);
	});
	const kept = new Set(chosen.map((e) => e.guideID));
	const written = new Set(entries.filter((e) => real(first.get(e.guideID))).map((e) => e.guideID));
	for (const e of chosen) {
		const byId = new Map(entries.map((x) => [x.guideID, x]));
		// A hand-off to a guide this run does not write would point nowhere.
		const next = (nextIds.get(e.guideID) || []).filter((id) => (only ? kept : written).has(id) && byId.get(id).faction === e.faction).map((id) => slugOf(byId.get(id)));
		const r = convertGuide(e, guideOf(e), data, { report, slug: slugOf(e), packId, names, fixed, before: before.get(e.guideID), next });
		guides.push({ slug: slugOf(e), text: r.text, stepsIn: r.stepsIn, stepsOut: r.stepsOut, format: r.format });
		gaps[`${slugOf(e)}.guide`] = r.gaps;
	}
	const settings = { ah: fixed.AH, groups: "GROUPS" in fixed ? fixed.GROUPS : "asked per quest (when group)", hardcore: false };
	return { guides, gaps, settings, report };
}
