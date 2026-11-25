// Matching a quest objective of a source guide to Polestar's objective of the
// same quest. Shared by the RXP and Zygor adapters.

import { plain } from "./rxp/parse.mjs";

export function normName(text) {
	return plain(text).toLowerCase().replace(/\(.*?\)/g, "").replace(/\bx\d+\b/g, "")
		.replace(/^(kill|collect|loot|free|talk to|use|find|click|cast|escort|speak with)\s+/g, "").replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim();
}

// Match an RXP objective to Polestar's by the name RXP prints, not by the
// number: the two number the objectives differently (e.g. quest 376).
// `opts.index` is RXP's own number (`.complete Q,n`): the fallback when the name
// matches none, trusted only when the objective it names fits the label, and it
// settles a name that fits several. A name that fits one objective only loosely
// while the number names another is no match (a bare `complete`), not a guess.
// `opts.strictItem`: with an item id, only an objective of that item is a hit.
export function resolveObjective(quest, label, itemId, opts = {}) {
	const objs = quest.objectives || [];
	if (!objs.length) return null;
	if (itemId != null) {
		const hit = objs.findIndex((o) => o.type === "item" && o.id === itemId);
		if (hit >= 0) return { obj: objs[hit], index: hit + 1 };
		if (opts.strictItem) return null;
	}
	const n = opts.index > 0 ? opts.index : null;
	if (objs.length === 1) return n > 1 ? null : { obj: objs[0], index: 1 };
	const want = normName(label);
	const byNumber = n && objs[n - 1] ? { obj: objs[n - 1], index: n } : null;
	if (want) {
		const withNames = objs.map((o, i) => ({ o, i, have: normName(o.text || "") })).filter((x) => x.have);
		const exact = withNames.filter((x) => x.have === want);
		if (exact.length === 1) return { obj: exact[0].o, index: exact[0].i + 1 };
		const partial = withNames.filter((x) => want.includes(x.have) || x.have.includes(want));
		if (n) {
			const mine = partial.find((x) => x.i === n - 1);
			if (mine) return byNumber;
			// The number names an objective the label does not: a loose name hit is no proof.
			if (partial.length === 1 && partial[0].have.length / want.length < 0.6 && !sharesWord(want, normName(objs[n - 1].text || ""))) return null;
			if (partial.length > 1) {
				const longest = [...partial].sort((a, b) => b.have.length - a.have.length);
				if (longest[0].have.length > longest[1].have.length && want.includes(longest[0].have)) return { obj: longest[0].o, index: longest[0].i + 1 };
			}
		}
		if (partial.length === 1) return { obj: partial[0].o, index: partial[0].i + 1 };
		if (n && !partial.length && byNumber && sharesWord(want, normName(byNumber.obj.text || ""))) return byNumber;
		return null;
	}
	return byNumber;
}

// Two names that are mostly the same words ("Mist Veil Lockbox", "Mist Veil's Lockbox"),
// not just one word alike ("Stolen Supplies", "Stolen Weapon").
const sharesWord = (a, b) => {
	const words = (t) => new Set(t.split(" ").filter((w) => w.length >= 3));
	const x = words(a), y = words(b);
	const both = [...x].filter((w) => y.has(w)).length;
	return both > 0 && both / (x.size + y.size - both) >= 0.5;
};
