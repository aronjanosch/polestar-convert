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
const sideOf = (g) => (parseCondition(g.header.faction).only.faction || [null])[0];

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

	// `next`: "Name", "Group\Name", "Name << Warlock", several split by ";".
	// Same group first, then the same faction.
	// An option for only some of the guide's characters (a Hunter route) stays when
	// the options together cover all of them: Polestar offers each character the
	// options whose guide is for them. Alone it would send everyone there.
	const next = new Map();
	for (const g of guides) {
		const out = [];
		const partial = [];
		for (const raw of String(g.header.next || "").split(";")) {
			const opt = raw.replace(/<<.*$/, "").trim();
			if (!opt) continue;
			const cut = opt.lastIndexOf("\\");
			const group = cut >= 0 ? opt.slice(0, cut) : g.header.group || "";
			const name = cut >= 0 ? opt.slice(cut + 1) : opt;
			let hit = byKey.get(`${group}\\${name}`);
			if (!hit) hit = (byName.get(name) || []).find((o) => sideOf(o) === sideOf(g)) || null;
			if (hit && twinOf.has(hit)) hit = twinOf.get(hit);
			if (hit && !covers(hit, g)) { partial.push(opt); if (!out.includes(hit)) out.push(hit); continue; }
			if (hit && !out.includes(hit)) out.push(hit);
			else if (!hit) report.note(g.header.name, 0, `next guide "${opt}" is not in this run (left out)`, g.header.next);
		}
		if (partial.length && coversAll(out, g)) report.count("next options for some characters, together for all (kept)", partial.length);
		else if (partial.length) {
			for (const opt of partial) report.note(g.header.name, 0, `next guide "${opt}" is not for every character of this one (left out)`, g.header.next);
			next.set(g, out.filter((o) => covers(o, g)));
			continue;
		}
		next.set(g, out);
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

// Whether every character guide `g` is for may follow `to`: what `to` names of
// class and race (header and RXP's defaultfor) holds for all of `g`'s.
const who = (x) => {
	const h = parseCondition(x.header.faction).only;
	const d = parseCondition(String(x.header.defaultfor || "").replace(/,/g, " ")).only;
	return { class: h.class || d.class || null, race: h.race || d.race || null };
};
function covers(to, g) {
	const t = who(to), m = who(g);
	return ["class", "race"].every((k) => !t[k] || (m[k] && m[k].every((n) => t[k].includes(n))));
}

// Whether every character of `g` (each class and race it is for) is one some guide
// of `list` is for.
function coversAll(list, g) {
	const m = who(g);
	const ts = list.map(who);
	return (m.class || CLASSES).every((c) => (m.race || RACES).every((r) =>
		ts.some((t) => (!t.class || t.class.includes(c)) && (!t.race || t.race.includes(r)))));
}

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
