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

function canon(name) {
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

// -> { only: {class?: string[], race?: string[], faction?: string[]}, unknown: string[], never: bool }
export function parseCondition(text) {
	const allowed = { class: null, race: null, faction: null };
	const unknown = [];
	if (!text) return { only: {}, unknown, never: false };
	for (const token of text.trim().split(/\s+/)) {
		const kinds = new Set();
		const names = new Set();
		for (const part of token.split("/")) {
			const neg = part.startsWith("!");
			const name = canon(part.replace(/^!/, ""));
			if (!name) { unknown.push(part); continue; }
			kinds.add(kindOf(name));
			const kind = kindOf(name);
			const set = neg ? UNIVERSE[kind].filter((n) => n !== name) : [name];
			for (const n of set) names.add(n);
		}
		if (kinds.size === 0) continue;
		if (kinds.size > 1) { unknown.push(token); continue; }
		const kind = [...kinds][0];
		// "!A/!B" would mean "not A or not B" = everybody; keep the OR reading.
		const next = UNIVERSE[kind].filter((n) => names.has(n));
		allowed[kind] = allowed[kind] ? allowed[kind].filter((n) => next.includes(n)) : next;
	}
	const only = {};
	let never = false;
	for (const kind of ["class", "race", "faction"]) {
		const list = allowed[kind];
		if (!list) continue;
		if (list.length === 0) never = true;
		else if (list.length < UNIVERSE[kind].length) only[kind] = list;
	}
	return { only, unknown, never };
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

export function onlyText(only) {
	const parts = [];
	for (const kind of ["class", "race", "faction"]) {
		if (only[kind] && only[kind].length) parts.push(only[kind].join(","));
	}
	return parts.join(",");
}
