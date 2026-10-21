// RXP conditions ("<< Warrior/Priest", "<< !Warlock !Mage", "<< Undead Mage")
// into Polestar `only` lists.
//
// RXP: space = AND, "/" = OR inside a token, "!" negates a name.
// Polestar: names of one kind (class, race, faction) OR together, the three
// kinds AND (docs/GUIDE_FORMAT.md, "Conditions"). "Not Warlock and not Mage"
// therefore has to become the positive list of the other classes.

export const CLASSES = ["Warrior", "Paladin", "Hunter", "Rogue", "Priest", "Shaman", "Mage", "Warlock", "Druid"];
// Skyborne: WoW Forever's race, on both sides.
export const RACES = ["Human", "Dwarf", "Gnome", "NightElf", "Orc", "Troll", "Tauren", "Undead", "Skyborne"];
export const FACTIONS = ["Alliance", "Horde"];

const ALIAS = new Map([
	["scourge", "Undead"], ["undead", "Undead"], ["nightelf", "NightElf"], ["night elf", "NightElf"],
]);

export function canon(name) {
	const low = name.toLowerCase();
	if (ALIAS.has(low)) return ALIAS.get(low);
	for (const list of [CLASSES, RACES, FACTIONS]) {
		const hit = list.find((n) => n.toLowerCase() === low);
		if (hit) return hit;
	}
	return null;
}

function kindOf(name) {
	if (CLASSES.includes(name)) return "class";
	if (RACES.includes(name)) return "race";
	if (FACTIONS.includes(name)) return "faction";
	return null;
}

const UNIVERSE = { class: CLASSES, race: RACES, faction: FACTIONS };
const KINDS = ["class", "race", "faction"];

// Skyborne is on both sides; every other race on one.
const HORDE_RACES = new Set(["Orc", "Troll", "Tauren", "Undead"]);
const factionsOf = (race) => (race === "Skyborne" ? FACTIONS : [HORDE_RACES.has(race) ? "Horde" : "Alliance"]);

// Every character a condition can be about: [class, race, faction].
const PLAYERS = [];
for (const c of CLASSES) for (const r of RACES) for (const f of factionsOf(r)) PLAYERS.push([c, r, f]);
const IDX = { class: 0, race: 1, faction: 2 };

// Words RXP's applies() knows to be false on WoW Forever (game FOREVER, season 0):
// `skip` is the "this step is switched off" marker, the rest name other game
// versions or seasons.
const FALSE_WORDS = new Set(["skip", "sod", "som", "era", "tbc", "wotlk", "cata", "mop", "classic", "hardcore", "df", "retail"]);
// ...and the game itself.
const TRUE_WORDS = new Set(["forever"]);

// RXP's applies(): "/" splits OR-groups first, inside a group the words are AND, "!" negates.
// -> { players: the characters it holds for, words: [{word, known}] }
function evaluate(text) {
	const unknown = [];
	if (!text || !text.trim()) return { players: PLAYERS, unknown };
	const pass = new Set();
	let any = false;
	for (const group of text.split("/")) {
		const words = group.match(/!?[A-Za-z0-9]+/g);
		if (!words) continue;
		any = true;
		let set = PLAYERS;
		for (const raw of words) {
			const neg = raw.startsWith("!");
			const word = neg ? raw.slice(1) : raw;
			const name = canon(word);
			const low = word.toLowerCase();
			let test;
			if (name) test = (p) => p[IDX[kindOf(name)]] === name;
			else if (TRUE_WORDS.has(low)) test = () => true;
			else if (/^\d+$/.test(word)) { unknown.push(raw); test = () => true; } // a level: not expressible
			else {
				if (!FALSE_WORDS.has(low)) unknown.push(raw);
				test = () => false;
			}
			set = set.filter((p) => test(p) !== neg);
		}
		for (const p of set) pass.add(p);
	}
	return { players: any ? PLAYERS.filter((p) => pass.has(p)) : PLAYERS, unknown };
}

const keyOf = (p) => p.join("|");

// The smallest `only` that holds exactly for `set` among `universe`, or null when
// the set is no product of class x race x faction there. `named` kinds stay
// spelled out when they are a proper subset (a guide's `<< Alliance Human`).
function productOf(set, universe, named) {
	const proj = (list) => KINDS.map((kind) => [...new Set(list.map((p) => p[IDX[kind]]))]);
	const [C, R, F] = proj(set);
	const has = new Set(set.map(keyOf));
	const lists = { class: C, race: R, faction: F };
	const full = proj(universe);
	const all = { class: full[0], race: full[1], faction: full[2] };
	const inProduct = (l) => universe.filter((p) => KINDS.every((k) => l[k].includes(p[IDX[k]])));
	const matches = (l) => { const m = inProduct(l); return m.length === set.length && m.every((p) => has.has(keyOf(p))); };
	if (!matches(lists)) return null;
	// Drop a kind that adds nothing: faction first (a race implies it), then race, class.
	for (const kind of ["faction", "race", "class"]) {
		if (named.has(kind) && lists[kind].length < all[kind].length) continue;
		const trial = { ...lists, [kind]: all[kind] };
		if (matches(trial)) lists[kind] = all[kind];
	}
	const only = {};
	for (const kind of KINDS) {
		const order = UNIVERSE[kind].filter((n) => lists[kind].includes(n));
		if (order.length < all[kind].length) only[kind] = order;
	}
	return only;
}

// A set that is no product, as disjoint products: group the (race, faction) cells by
// their class list, or the classes by their cell list; the fewer groups win.
function split(set, universe, named) {
	// Bundle the keys (cells or classes) whose characters share one signature.
	const bundle = (keyOf1, sigOf) => {
		const byKey = new Map();
		for (const p of set) (byKey.get(keyOf1(p)) || byKey.set(keyOf1(p), []).get(keyOf1(p))).push(p);
		const groups = new Map();
		for (const ps of byKey.values()) {
			const sig = ps.map(sigOf).sort().join(",");
			(groups.get(sig) || groups.set(sig, []).get(sig)).push(...ps);
		}
		return [...groups.values()];
	};
	const byCells = bundle((p) => p[1] + "|" + p[2], (p) => p[0]);
	const byClassExact = bundle((p) => p[0], (p) => p[1] + "|" + p[2]);
	const attempt = (parts) => {
		const out = [];
		for (const part of parts) {
			let prod = productOf(part, universe, named);
			if (prod) { out.push(prod); continue; }
			// cells of one faction at a time
			for (const f of FACTIONS) {
				const sub = part.filter((p) => p[2] === f);
				if (!sub.length) continue;
				prod = productOf(sub, universe, named);
				if (!prod) return null;
				out.push(prod);
			}
		}
		return out;
	};
	const options = [attempt(byCells), attempt(byClassExact)].filter(Boolean);
	options.sort((a, b) => a.length - b.length);
	return options[0] || null;
}

// RXP's condition text -> Polestar `only`, evaluated the way RXP's applies() does.
//   scope: { class?, race?, faction? } lists the guide is for; inside it the
//          condition is exact where it is a product there.
// -> { only, groups, unknown, never, inexact }
//   only    the one `only` (the smallest superset when no product exists)
//   groups  disjoint `only`s that together are the condition exactly (one when exact)
//   never   nobody (in the scope) passes
export function parseCondition(text, scope) {
	const { players, unknown } = evaluate(text);
	const universe = PLAYERS.filter((p) => KINDS.every((k) => !(scope && scope[k]) || scope[k].includes(p[IDX[k]])));
	const keep = new Set(universe.map(keyOf));
	const set = players.filter((p) => keep.has(keyOf(p)));
	const named = new Set();
	for (const w of String(text || "").match(/[A-Za-z0-9]+/g) || []) { const n = canon(w); if (n) named.add(kindOf(n)); }
	if (!set.length) return { only: {}, groups: [], unknown, never: true, inexact: false, anywhere: players.length > 0 };
	const exact = productOf(set, universe, named);
	if (exact) return { only: exact, groups: [exact], unknown, never: false, inexact: false };
	const groups = split(set, universe, named);
	// The smallest superset: every kind the set touches, as one product.
	const proj = KINDS.map((k) => [...new Set(set.map((p) => p[IDX[k]]))]);
	const all = KINDS.map((k) => new Set(universe.map((p) => p[IDX[k]])).size);
	const only = {};
	KINDS.forEach((k, i) => { if (proj[i].length < all[i]) only[k] = UNIVERSE[k].filter((n) => proj[i].includes(n)); });
	return { only, groups: groups || [only], unknown, never: false, inexact: true };
}

// Intersect two parsed conditions (step AND line).
export function andOnly(a, b) {
	const out = {};
	for (const kind of ["class", "race", "faction"]) {
		const x = a[kind], y = b[kind];
		if (x && y) out[kind] = x.filter((n) => y.includes(n));
		else if (x || y) out[kind] = x || y;
	}
	return out;
}

// Some character fits both `only` objects (race implies faction).
export function onlyMeet(a, b) {
	const ok = (o) => (p) => KINDS.every((k) => !o[k] || o[k].includes(p[IDX[k]]));
	const x = ok(a), y = ok(b);
	return PLAYERS.some((p) => x(p) && y(p));
}

// Some player passes both RXP conditions (null = everybody).
export function condsMeet(a, b) {
	const x = new Set(evaluate(a).players.map(keyOf));
	return evaluate(b).players.some((p) => x.has(keyOf(p)));
}

export function onlyText(only) {
	const parts = [];
	for (const kind of ["class", "race", "faction"]) {
		if (only[kind] && only[kind].length) parts.push(only[kind].join(","));
	}
	return parts.join(",");
}
