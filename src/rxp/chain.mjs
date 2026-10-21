// How the guides of one run hang together: a unique slug per guide, the
// guides each one hands off to (RXP `next`), and the quests accepted on the
// way into it. RXP names a guide by group and name; one file can hold two
// guides of one name (a leveling route and its dungeon variant).

import { parseCondition, CLASSES, RACES } from "../cond.mjs";

export function slugOf(name) {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// "RestedXP Forever Dungeon Guide (A)" -> "dungeon"; the words every group shares are left out.
function groupTag(group) {
	const rest = String(group || "").replace(/\([AH]\)/g, " ").split(/\s+/)
		.filter((w) => w && !/^(restedxp|rxp|forever|guides?)$/i.test(w));
	return slugOf(rest.join(" ")) || "leveling";
}

const keyOf = (g) => `${g.header.group || ""}\\${g.header.name || ""}`;
// The header's `<<` side, else the one its group name carries: "(A)" or "(H)".
const sideOf = (g) => (parseCondition(g.header.faction).only.faction || [null])[0]
	|| { A: "Alliance", H: "Horde" }[(String(g.header.group || "").match(/\(([AH])\)/) || [])[1]] || null;

// `#include Group\Name` in a step: RXP puts that guide's steps there (its dungeon
// variants of the starting routes are a step turning a dungeon on and the route).
export function expandIncludes(guides, report) {
	const byKey = new Map(guides.map((g) => [keyOf(g), g]));
	const expand = (g, depth) => g.steps.flatMap((s) => {
		const inc = s.tags.find((t) => t.name === "include");
		if (!inc) return [s];
		// "Group\Name@from-to": only the steps from one label to the other.
		const [ref, range] = String(inc.args).trim().split("@");
		const target = byKey.get(ref.trim());
		if (!target || depth > 5) { report.count("#include of a guide not in this run (left out)"); return []; }
		const steps = expand(target, depth + 1);
		if (!range) { report.count("#include -> the included guide's steps"); return steps; }
		const at = (label) => steps.findIndex((x) => x.tags.some((t) => t.name === "label" && String(t.args).trim() === label));
		for (let i = range.indexOf("-"); i > 0; i = range.indexOf("-", i + 1)) {
			const a = at(range.slice(0, i)), b = at(range.slice(i + 1));
			if (a >= 0 && b >= a) { report.count("#include of a part -> those steps"); return steps.slice(a, b + 1); }
		}
		const a = at(range);
		if (a >= 0) { report.count("#include of a part -> those steps"); return steps.slice(a); }
		report.count("#include of a part with unknown labels (left out)");
		return [];
	});
	return guides.map((g) => (g.steps.some((s) => s.tags.some((t) => t.name === "include")) ? { ...g, steps: expand(g, 0) } : g));
}

const isSkip = (g) => /\bskip\b/i.test(String(g.header.faction || ""));

export function planChain(guides, report) {
	// RXP registers some guides twice under one group and name: the one it lists
	// (`#disabledungeons`) and a twin it hides (`skip` in its condition), the same
	// steps. Only the listed one is written; a hand-off to the twin goes to it.
	const listed = new Map();
	for (const g of guides) if (!isSkip(g)) listed.set(keyOf(g), g);
	const twinOf = new Map(guides.filter((g) => isSkip(g) && listed.has(keyOf(g))).map((g) => [g, listed.get(keyOf(g))]));
	const hidden = new Set(twinOf.keys());
	if (hidden.size) report.count("hidden twin of a listed guide (not written)", hidden.size);
	guides = guides.filter((g) => !hidden.has(g));
	const byKey = new Map();
	const byName = new Map();
	for (const g of guides) {
		byKey.set(keyOf(g), g);
		const n = g.header.name || "";
		if (!byName.has(n)) byName.set(n, []);
		byName.get(n).push(g);
	}

	// The first guide of a name keeps the plain slug; one of another group gets its tag.
	const slug = new Map();
	const used = new Set();
	for (const g of guides) {
		const first = byName.get(g.header.name || "")[0];
		const base = slugOf(g.header.name || "guide");
		const tagged = first !== g && first.header.group !== g.header.group ? `${groupTag(g.header.group)}-${base}` : base;
		let s = tagged;
		for (let n = 2; used.has(s); n++) s = `${tagged}-${n}`;
		used.add(s);
		slug.set(g, s);
	}

	// `next`: "Name", "Group\Name", several split by ";", a line may end in "<< cond".
	// RXP takes the first `#next` line that holds for the character, and on it the
	// first guide that exists for them (a guide whose header `<<` leaves them out is
	// not loaded). Polestar's `next` cannot name a class, so every character of the
	// guide is run through that and the guides chosen for any of them are the options.
	const next = new Map();
	for (const g of guides) {
		const lines = (g.header.nexts || []).map((raw) => {
			const ci = raw.indexOf("<<");
			const parts = (ci >= 0 ? raw.slice(0, ci) : raw).split(";").map((x) => x.trim()).filter(Boolean).map((opt) => {
				const cut = opt.lastIndexOf("\\");
				return { opt, group: cut >= 0 ? opt.slice(0, cut).trim() : g.header.group || "", name: cut >= 0 ? opt.slice(cut + 1).trim() : opt };
			});
			return { raw, only: ci >= 0 ? parseCondition(raw.slice(ci + 2)).only : {}, parts };
		});
		// The guide of a part for a character, or null: one of its side, open to its class and race.
		const resolve = (part, ch) => {
			const ok = (o) => o && [null, ch.faction].includes(sideOf(o)) && meets(who(o), ch);
			// RXP looks in the part's group, and only elsewhere when the group has no such guide.
			let hit = byKey.get(`${part.group}\\${part.name}`);
			if (hit) { if (!ok(hit)) hit = null; }
			else hit = (byName.get(part.name) || []).find(ok) || null;
			return hit && twinOf.has(hit) ? twinOf.get(hit) : hit;
		};
		const picked = new Map();
		for (const ch of charactersOf(g)) {
			const li = lines.findIndex((l) => meets(l.only, ch));
			if (li < 0) continue;
			const parts = lines[li].parts.map((p) => resolve(p, ch));
			const pi = parts.findIndex(Boolean);
			if (pi >= 0 && !picked.has(parts[pi])) picked.set(parts[pi], li * 100 + pi);
		}
		for (const l of lines) for (const p of l.parts) {
			if (!byName.has(p.name)) report.note(g.header.name, 0, `next guide "${p.opt}" is not in this run (left out)`, l.raw);
		}
		// In the order the lines name them: the first is the author's default.
		next.set(g, [...picked].sort((x, y) => x[1] - y[1]).map(([o]) => o));
	}

	// Quests accepted in the guides that hand off into each guide, down the chain.
	const into = new Map(guides.map((g) => [g, []]));
	for (const g of guides) for (const n of next.get(g)) into.get(n).push(g);
	const own = new Map(guides.map((g) => [g, acceptsOf(g)]));
	const before = new Map();
	for (const g of guides) {
		const seen = new Set();
		const quests = new Set();
		const queue = [...into.get(g)];
		while (queue.length) {
			const p = queue.shift();
			if (seen.has(p) || p === g) continue;
			seen.add(p);
			for (const q of own.get(p)) quests.add(q);
			queue.push(...into.get(p));
		}
		before.set(g, quests);
	}
	return { slug, next, before, hidden };
}

// What a header's `<<` line leaves of class and race: null for no limit.
const who = (x) => {
	const h = parseCondition(x.header.faction).only;
	return { class: h.class || null, race: h.race || null };
};
const SIDE = { Alliance: ["Human", "Dwarf", "Gnome", "NightElf", "Skyborne"], Horde: ["Orc", "Troll", "Tauren", "Undead", "Skyborne"] };
// Every class and race the guide is for (a guide of no side: any race).
function charactersOf(g) {
	const w = who(g);
	const side = SIDE[sideOf(g)];
	const races = (w.race || RACES).filter((r) => !side || side.includes(r));
	const factions = (r) => (r === "Skyborne" ? (sideOf(g) ? [sideOf(g)] : ["Alliance", "Horde"]) : [SIDE.Alliance.includes(r) ? "Alliance" : "Horde"]);
	return (w.class || CLASSES).flatMap((c) => races.flatMap((r) => factions(r).map((faction) => ({ class: c, race: r, faction }))));
}
const meets = (only, ch) => (!only.class || only.class.includes(ch.class)) && (!only.race || only.race.includes(ch.race)) && (!only.faction || only.faction.includes(ch.faction));

function acceptsOf(g) {
	const out = new Set();
	for (const s of g.steps) for (const l of s.lines) {
		if (l.kind === "cmd" && l.name === "accept") {
			const id = Number((l.args.match(/^(\d+)/) || [])[1]);
			if (id) out.add(id);
		}
	}
	return out;
}
