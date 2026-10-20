// How the guides of one run hang together: a unique slug per guide, the
// guides each one hands off to (RXP `next`), and the quests accepted on the
// way into it. RXP names a guide by group and name; one file can hold two
// guides of one name (a leveling route and its dungeon variant).

import { parseCondition } from "../cond.mjs";

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

export function planChain(guides, report) {
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
	const next = new Map();
	for (const g of guides) {
		const out = [];
		for (const raw of String(g.header.next || "").split(";")) {
			const opt = raw.replace(/<<.*$/, "").trim();
			if (!opt) continue;
			const cut = opt.lastIndexOf("\\");
			const group = cut >= 0 ? opt.slice(0, cut) : g.header.group || "";
			const name = cut >= 0 ? opt.slice(cut + 1) : opt;
			let hit = byKey.get(`${group}\\${name}`);
			if (!hit) hit = (byName.get(name) || []).find((o) => sideOf(o) === sideOf(g)) || null;
			if (hit && !covers(hit, g)) { report.note(g.header.name, 0, `next guide "${opt}" is not for every character of this one (left out)`, g.header.next); continue; }
			if (hit && !out.includes(hit)) out.push(hit);
			else if (!hit) report.note(g.header.name, 0, `next guide "${opt}" is not in this run (left out)`, g.header.next);
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
	return { slug, next, before };
}

// Whether every character guide `g` is for may follow `to`: what `to` names of
// class and race (header and RXP's defaultfor) holds for all of `g`'s.
function covers(to, g) {
	const who = (x) => {
		const h = parseCondition(x.header.faction).only;
		const d = parseCondition(String(x.header.defaultfor || "").replace(/,/g, " ")).only;
		return { class: h.class || d.class || null, race: h.race || d.race || null };
	};
	const t = who(to), m = who(g);
	return ["class", "race"].every((k) => !t[k] || (m[k] && m[k].every((n) => t[k].includes(n))));
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
