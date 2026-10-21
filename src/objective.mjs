// Matching a quest objective of a source guide to Polestar's objective of the
// same quest. Shared by the RXP and Zygor adapters.

import { plain } from "./rxp/parse.mjs";

export function normName(text) {
	return plain(text).toLowerCase().replace(/\(.*?\)/g, "").replace(/\bx\d+\b/g, "")
		.replace(/^(kill|collect|loot|free|talk to|use|find|click|cast|escort|speak with)\s+/g, "").replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim();
}

// Match an RXP objective to Polestar's by the name RXP prints, not by the
// number: the two number the objectives differently (e.g. quest 376).
export function resolveObjective(quest, label, itemId) {
	const objs = quest.objectives || [];
	if (!objs.length) return null;
	if (itemId != null) {
		const hit = objs.findIndex((o) => o.type === "item" && o.id === itemId);
		if (hit >= 0) return { obj: objs[hit], index: hit + 1 };
	}
	if (objs.length === 1) return { obj: objs[0], index: 1 };
	const want = normName(label);
	if (want) {
		const withNames = objs.map((o, i) => ({ o, i, have: normName(o.text || "") })).filter((x) => x.have);
		const exact = withNames.filter((x) => x.have === want);
		if (exact.length === 1) return { obj: exact[0].o, index: exact[0].i + 1 };
		const partial = withNames.filter((x) => want.includes(x.have) || x.have.includes(want));
		if (partial.length === 1) return { obj: partial[0].o, index: partial[0].i + 1 };
	}
	return null;
}
