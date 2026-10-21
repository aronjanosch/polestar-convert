// Journey conditions (Lua boolean expressions, JOURNEY-FORMAT.md "Conditions")
// for a Forever character: who they are for (Polestar `only`) and what must hold
// in play (Polestar `when`).
//
// A condition is evaluated once per class and race pair the guide's faction can
// play. Names fixed on Forever (ERA, WOTLK, HC, ...) fold away; class, race and
// faction names are the pair's own; the rest is runtime state, kept as a
// residual expression and turned into `when` predicates where Polestar has one.

// Journey's race names (UnitRace's file name, upper-cased) -> Polestar's.
export const RACE_NAMES = {
	HUMAN: "Human", DWARF: "Dwarf", GNOME: "Gnome", NIGHTELF: "NightElf", ORC: "Orc",
	TROLL: "Troll", TAUREN: "Tauren", SCOURGE: "Undead", SKYBORNE: "Skyborne",
};
export const CLASS_NAMES = {
	WARRIOR: "Warrior", PALADIN: "Paladin", HUNTER: "Hunter", ROGUE: "Rogue", PRIEST: "Priest",
	SHAMAN: "Shaman", MAGE: "Mage", WARLOCK: "Warlock", DRUID: "Druid",
};
const QUEST_STATES = { NONE: 0, ACCEPTED: 1, COMPLETED: 2, TURNEDIN: 3, FAILED: -1 };
// Fixed for a Forever character (Condition.lua: client 1.16+ sets ERA and FOREVER).
// Settings take Journey's defaults unless the caller says otherwise.
const FIXED = { ERA: true, FOREVER: true, PHASE: 6, MOPPHASE: 2, HC: false, AH: true, GROUPS: true, SEEKING: false };
// Runtime names Polestar has no predicate for, read as "nothing has happened yet
// on this step" when only a text or a waypoint depends on them.
const LOCAL_STATE = new Set(["WITHIN", "VISITED", "EXITED", "ACTIVE", "CHECKPOINT", "COMPLETE", "ROOT_COMPLETED", "TGLOCATION_ENABLED"]);
// What Polestar cannot check, read as the route's normal case: no such spell
// learnt or cast yet, alive, not grouped, not on a flight, the objective still
// open, no such buff. -> value, or undefined to keep it.
const NORMAL = { SPELL: false, PETSPELL: false, SPELLCAST: false, GHOST: false, DEAD: false, DEADORGHOST: false, DIED: false, SPIRITRESSED: false, ALIVE: true, INGROUP: false, ONTAXI: false, INVEHICLE: false, OBJECTIVE: false, BUFF: false, DEBUFF: false };
export function normalCase(name) {
	return Object.prototype.hasOwnProperty.call(NORMAL, name) ? NORMAL[name] : undefined;
}

// Runtime names: anything that is neither fixed nor who the character is.
const RUNTIME = new Set(["QUEST", "OBJECTIVE", "OBJECTIVECOUNT", "ITEM", "BANKITEM", "LEVEL", "LEVELD", "XP", "XPMAX", "MONEY",
	"SPELL", "PETSPELL", "SPELLCAST", "HASTAXI", "HEARTHSTONE", "ZONE", "AREA", "WMOAREA", "PARENTWMOAREA", "CONTINENT", "BUFF", "BUFFCOUNT", "DEBUFF", "REP",
	"VAR", "GUIDE", "SESSION", "INDOORS", "OUTDOORS", "ONTAXI", "INGROUP", "ALIVE", "DEAD", "DEADORGHOST", "GHOST", "DIED", "SPIRITRESSED",
	"RESUPPLIED", "REPAIRED", "TALENTTRAINER", "TRADESKILLTRAINER", "WEAPONSKILLTRAINER", "PETSTABLE", "TAXITAKEN", "FLYING", "FLYINGMOUNT",
	"INVEHICLE", "HINTLEVEL", "SPOILER", "HASRETURNGUIDE", "RANGED", "RANGEDSUBCLASS", ...LOCAL_STATE]);
// Profession skills, their tiers and weapon kinds: runtime values too (Condition.lua).
const PROFESSIONS = ["FIRSTAID", "COOKING", "FISHING", "HERBALISM", "MINING", "SKINNING", "ALCHEMY", "BLACKSMITHING", "ENCHANTING", "ENGINEERING", "LEATHERWORKING", "TAILORING"];
for (const p of PROFESSIONS) { RUNTIME.add(p); RUNTIME.add(p + "_POINTS"); }
for (const n of ["BOWS", "CROSSBOW", "GUNS", "THROWN", "WANDS"]) RUNTIME.add(n);
// Profession tiers (services/Professions.lua); a profession's value is the tier learnt.
const TIERS = { APPRENTICE: 1, JOURNEYMAN: 2, EXPERT: 3, ARTISAN: 4, MASTER: 5, GRANDMASTER: 6 };
// Journey's profession keys -> the names Polestar's `skill` takes.
const SKILL_NAMES = { FIRSTAID: "First Aid", COOKING: "Cooking", FISHING: "Fishing", HERBALISM: "Herbalism", MINING: "Mining", SKINNING: "Skinning", ALCHEMY: "Alchemy",
	BLACKSMITHING: "Blacksmithing", ENCHANTING: "Enchanting", ENGINEERING: "Engineering", LEATHERWORKING: "Leatherworking", TAILORING: "Tailoring" };
// A guide id ("H12B"): true when that guide is installed, as all of Journey's are.
const GUIDE_ID = /^[AHB]\d+[A-Z]*$/;

// ---- parsing ---------------------------------------------------------------

function tokenize(text) {
	const out = [];
	const re = /\s*(?:(\d+(?:\.\d+)?)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|([A-Za-z_][A-Za-z_0-9]*(?:\.[A-Za-z_][A-Za-z_0-9]*)?)|(==|~=|<=|>=|[<>()[\]]))/y;
	let m;
	let i = 0;
	const s = String(text);
	while (i < s.length) {
		if (/^\s*$/.test(s.slice(i))) break;
		re.lastIndex = i;
		m = re.exec(s);
		if (!m) throw new Error(`condition: cannot read "${s.slice(i, i + 20)}" in "${s}"`);
		i = re.lastIndex;
		if (m[1]) out.push({ t: "num", v: Number(m[1]) });
		else if (m[2]) out.push({ t: "str", v: m[2].slice(1, -1) });
		else if (m[3]) out.push(["and", "or", "not", "true", "false", "nil"].includes(m[3]) ? { t: m[3] } : { t: "name", v: m[3] });
		else out.push({ t: m[4] });
	}
	return out;
}

// -> AST: {op:"or"|"and", a, b} | {op:"not", a} | {op:"cmp", cmp, a, b}
//    | {op:"name", name} | {op:"index", name, keys:[n]} | {op:"num"|"str"|"bool", v}
export function parseExpr(text) {
	const toks = tokenize(text);
	let p = 0;
	const peek = () => toks[p] || { t: "eof" };
	const take = (t) => { if (peek().t !== t) throw new Error(`condition: expected ${t} in "${text}"`); return toks[p++]; };
	const or = () => { let a = and(); while (peek().t === "or") { p++; a = { op: "or", a, b: and() }; } return a; };
	const and = () => { let a = cmp(); while (peek().t === "and") { p++; a = { op: "and", a, b: cmp() }; } return a; };
	const cmp = () => {
		const a = unary();
		if (["==", "~=", "<", "<=", ">", ">="].includes(peek().t)) { const c = toks[p++].t; return { op: "cmp", cmp: c, a, b: unary() }; }
		return a;
	};
	const unary = () => {
		if (peek().t === "not") { p++; return { op: "not", a: unary() }; }
		return primary();
	};
	const primary = () => {
		const t = toks[p++] || { t: "eof" };
		if (t.t === "(") { const e = or(); take(")"); return e; }
		if (t.t === "num") return { op: "num", v: t.v };
		if (t.t === "str") return { op: "str", v: t.v };
		if (t.t === "true" || t.t === "false") return { op: "bool", v: t.t === "true" };
		if (t.t === "nil") return { op: "bool", v: false };
		if (t.t === "name") {
			const keys = [];
			while (peek().t === "[") { p++; keys.push(or()); take("]"); }
			return keys.length ? { op: "index", name: t.v, keys } : { op: "name", name: t.v };
		}
		throw new Error(`condition: unexpected ${t.t} in "${text}"`);
	};
	const e = or();
	if (p < toks.length) throw new Error(`condition: trailing tokens in "${text}"`);
	return e;
}

// ---- partial evaluation ----------------------------------------------------

const B = (v) => ({ op: "bool", v });
const isB = (e) => e.op === "bool";
const isConst = (e) => e.op === "bool" || e.op === "num" || e.op === "str";
const rootName = (e) => (e.op === "name" || e.op === "index" ? e.name.split(".")[0] : null);

// Fold what is known for one character (`who` = Set of upper-case class, race and
// faction names); runtime parts stay. `local`: read LOCAL_STATE as "not yet".
function fold(e, who, opts) {
	switch (e.op) {
		case "bool": case "num": case "str": return e;
		case "name": {
			const n = e.name;
			// The grouping setting, asked per quest in Polestar (`when group <quest>`);
			// texts read Journey's default.
			if (n === "GROUPS" && opts.askGroups && !opts.route && !(opts.fixed && n in opts.fixed)) return e;
			if (opts.fixed && n in opts.fixed) { const v = opts.fixed[n]; return typeof v === "number" ? { op: "num", v } : B(!!v); }
			if (n in FIXED) { const v = FIXED[n]; return typeof v === "number" ? { op: "num", v } : B(v); }
			if (n in QUEST_STATES) return { op: "num", v: QUEST_STATES[n] };
			if (n in TIERS) return { op: "num", v: TIERS[n] };
			if (n in CLASS_NAMES || n in RACE_NAMES || n === "HORDE" || n === "ALLIANCE") return B(who.has(n));
			if (RUNTIME.has(rootName(e)) && opts.assume) { const v = opts.assume(n, null); if (v !== undefined) return typeof v === "number" ? { op: "num", v } : B(!!v); }
			if (RUNTIME.has(rootName(e))) return opts.local && LOCAL_STATE.has(n) ? (n === "ACTIVE" || n === "CHECKPOINT" ? { op: "num", v: 0 } : B(false)) : e;
			if (GUIDE_ID.test(n)) return B(true);
			// Any other name (TBC, WOTLK, SOD2, SOM1, JOYOUS, DEV, ...) is unset on Forever.
			return B(false);
		}
		case "index": {
			const keys = e.keys.map((k) => fold(k, who, opts));
			const ne = { ...e, keys };
			// Texts: the quest's state where the route stands (taken, handed in), and
			// objectives not done yet.
			if (opts.route && e.name === "QUEST" && keys[0].op === "num") return { op: "num", v: opts.route(keys[0].v) };
			if (opts.route && e.name === "OBJECTIVE") return B(false);
			// A quest Forever does not have (another version's): never taken.
			if (opts.questKnown && (e.name === "QUEST" || e.name === "OBJECTIVE") && keys[0].op === "num" && !opts.questKnown(keys[0].v)) return e.name === "QUEST" ? { op: "num", v: 0 } : B(false);
			if (opts.local && LOCAL_STATE.has(rootName(e))) return B(false);
			if (opts.assume && keys.every(isConst)) { const v = opts.assume(e.name, keys.map((k) => k.v)); if (v !== undefined) return typeof v === "number" ? { op: "num", v } : B(!!v); }
			return ne;
		}
		case "not": {
			const a = fold(e.a, who, opts);
			return isB(a) ? B(!a.v) : { op: "not", a };
		}
		case "and": case "or": {
			const a = fold(e.a, who, opts);
			if (isB(a)) { if (e.op === "and" ? !a.v : a.v) return a; return fold(e.b, who, opts); }
			const b = fold(e.b, who, opts);
			if (isB(b)) return (e.op === "and" ? b.v : !b.v) ? a : b;
			return { op: e.op, a, b };
		}
		case "cmp": {
			const a = fold(e.a, who, opts), b = fold(e.b, who, opts);
			if (isConst(a) && isConst(b)) return B(compare(e.cmp, a.v, b.v));
			// A runtime value compared with a constant that is not a number (a name
			// unset on Forever): `RANGED ~= 205420` stays, `X == nil` folds.
			if (isB(b) && !b.v && e.cmp === "==") return B(false);
			if (isB(b) && !b.v && e.cmp === "~=") return B(true);
			return { op: "cmp", cmp: e.cmp, a, b };
		}
		default: throw new Error("condition: unknown node " + e.op);
	}
}

function compare(c, x, y) {
	switch (c) {
		case "==": return x === y;
		case "~=": return x !== y;
		case "<": return x < y;
		case "<=": return x <= y;
		case ">": return x > y;
		case ">=": return x >= y;
	}
	return false;
}

// Whether a residual depends on the step's own location state only (WITHIN,
// ACTIVE, ...): words for the way through a step, not for who or when.
export function localOnly(e) {
	if (!e || isConst(e)) return true;
	if (e.op === "name" || e.op === "index") return LOCAL_STATE.has(rootName(e));
	return ["a", "b"].every((k) => !e[k] || localOnly(e[k]));
}

export function show(e) {
	switch (e.op) {
		case "bool": case "num": return String(e.v);
		case "str": return JSON.stringify(e.v);
		case "name": return e.name;
		case "index": return e.name + e.keys.map((k) => `[${show(k)}]`).join("");
		case "not": return `not ${e.a.op === "and" || e.a.op === "or" || e.a.op === "cmp" ? "(" + show(e.a) + ")" : show(e.a)}`;
		case "cmp": return `${show(e.a)} ${e.cmp} ${show(e.b)}`;
		case "and": case "or": {
			const w = (x) => (x.op === "or" && e.op === "and" ? `(${show(x)})` : show(x));
			return `${w(e.a)} ${e.op} ${w(e.b)}`;
		}
	}
	return "?";
}

// ---- who: class and race pairs -> Polestar `only` ---------------------------

// The pairs a faction plays on Forever, from Polestar's races.json.
export function pairsOf(data, faction) {
	const out = [];
	const fileOf = (name) => Object.keys(RACE_NAMES).find((k) => RACE_NAMES[k] === (name === "Scourge" ? "Undead" : name));
	for (const [race, sides] of Object.entries(data.races || {})) {
		for (const [side, r] of Object.entries(sides)) {
			if (faction && side !== faction) continue;
			const rk = fileOf(race);
			if (!rk) continue;
			for (const c of r.classes) out.push({ cls: c, race: rk, faction: side.toUpperCase() });
		}
	}
	return out;
}

// Pairs -> list of { only: {class?, race?}, pairs } whose union is `pairs`: one
// entry when the pairs are a product of classes and races, else one per set of
// races sharing the same classes.
export function onlyFor(pairs, universe) {
	if (!pairs.length) return [];
	const key = (p) => p.cls + "/" + p.race;
	const want = new Set(pairs.map(key));
	const named = (cs, rs) => ({ class: cs ? cs.map((c) => CLASS_NAMES[c]) : undefined, race: rs ? rs.map((r) => RACE_NAMES[r]) : undefined });
	// The shortest list that names exactly these pairs: nothing, classes, races, both.
	const same = (cs, rs, among) => among.every((p) => want.has(key(p)) === ((!cs || cs.includes(p.cls)) && (!rs || rs.includes(p.race))));
	const classesIn = [...new Set(pairs.map((p) => p.cls))];
	const racesIn = [...new Set(pairs.map((p) => p.race))];
	for (const [cs, rs] of [[null, null], [classesIn, null], [null, racesIn], [classesIn, racesIn]]) {
		if (same(cs, rs, universe)) return [{ only: named(cs, rs), pairs }];
	}
	// Not one list: one per set of races that share the same classes.
	const byRace = new Map();
	for (const p of pairs) byRace.set(p.race, [...(byRace.get(p.race) || []), p.cls]);
	const groups = new Map();
	for (const [race, cs] of byRace) {
		const k = [...cs].sort().join(",");
		groups.set(k, [...(groups.get(k) || []), race]);
	}
	return [...groups].map(([k, rs]) => {
		const among = universe.filter((p) => rs.includes(p.race));
		const cs = k.split(",");
		return { only: named(same(null, rs, among) ? null : cs, rs), pairs: pairs.filter((p) => rs.includes(p.race)) };
	});
}

export function onlyString(only) {
	return [...(only.class || []), ...(only.race || [])].join(",");
}

// ---- residual -> Polestar `when` ------------------------------------------

// A quest state set ({0,1,2,3}) -> `when` terms (OR of ANDs) that hold for
// exactly those states. NONE 0, ACCEPTED 1, COMPLETED 2, TURNEDIN 3.
const QUEST_CONJ = {
	"3": ["turnedin"], "0,1,2": ["!turnedin"], "1,2": ["onquest"], "0,3": ["!onquest"], "2": ["complete"],
	"0,1,3": ["!complete"], "0": ["!onquest", "!turnedin"], "0,1": ["!complete", "!turnedin"], "1": ["onquest", "!complete"],
};
// The others as disjoint unions of those.
const QUEST_SPLIT = { "1,2,3": ["1,2", "3"], "2,3": ["2", "3"], "0,2": ["0", "2"], "0,2,3": ["0,3", "2"], "1,3": ["1", "3"] };

function questTerms(cmp, value, q) {
	const states = [0, 1, 2, 3].filter((s) => compare(cmp, s, value));
	const key = states.join(",");
	if (!states.length) return [];
	if (states.length === 4) return [[]];
	const parts = QUEST_CONJ[key] ? [key] : QUEST_SPLIT[key];
	return parts.map((k) => QUEST_CONJ[k].map((p) => `${p} ${q}`));
}

const flip = { "<": ">", "<=": ">=", ">": "<", ">=": "<=", "==": "==", "~=": "~=" };
const neg = { "<": ">=", "<=": ">", ">": "<=", ">=": "<", "==": "~=", "~=": "==" };

// One literal (a comparison, an index, or `not` of one) -> `when` terms (OR of
// ANDs), or null when Polestar has no predicate for it. `names` resolves zones,
// areas and inns to the names Polestar compares.
function literalTerms(e, names, negate = false) {
	if (e.op === "not") return literalTerms(e.a, names, !negate);
	if (e.op === "index" || e.op === "name") return literalTerms({ op: "cmp", cmp: "~=", a: e, b: B(false) }, names, negate);
	if (e.op !== "cmp") return null;
	let { cmp, a, b } = e;
	if (isConst(a) && !isConst(b)) { [a, b] = [b, a]; cmp = flip[cmp]; }
	if (negate) cmp = neg[cmp];
	const key = a.op === "index" && a.keys.every(isConst) ? a.keys.map((k) => k.v) : null;
	const root = a.op === "index" ? a.name : a.op === "name" ? a.name : null;
	// The quest is the step's, filled in once its goals are known.
	if (root === "GROUPS" && isB(b) && !b.v) return [[`${cmp === "==" ? "!" : ""}group ${GROUP_QUEST}`]];
	if (root === "QUEST" && key && b.op === "num") return questTerms(cmp, b.v, key[0]);
	if ((root === "LEVEL" || root === "LEVELD") && b.op === "num") {
		if (cmp === "==") return [[`level>=${b.v}`, `level<${b.v + 1}`]];
		if (cmp === "~=") return [[`level<${b.v}`], [`level>=${b.v + 1}`]];
		return [[`level${cmp}${b.v}`]];
	}
	if (root === "MONEY" && b.op === "num" && cmp !== "==" && cmp !== "~=") return [[`money${cmp}${b.v}`]];
	if (root === "ITEM" && key && b.op === "num") {
		const n = b.v;
		const has = (k) => (k <= 1 ? `has ${key[0]}` : `has ${key[0]} x${k}`);
		if (cmp === ">=") return [n <= 0 ? [] : [has(n)]];
		if (cmp === ">") return [[has(n + 1)]];
		if (cmp === "<") return n <= 0 ? [] : [["!" + has(n)]];
		if (cmp === "<=") return [["!" + has(n + 1)]];
		if (cmp === "==" && n === 0) return [["!" + has(1)]];
		if (cmp === "~=" && n === 0) return [[has(1)]];
		return null;
	}
	if (root === "ITEM" && key && isB(b) && !b.v) return [[cmp === "==" ? `!has ${key[0]}` : `has ${key[0]}`]];
	if (root === "ZONE" && b.op === "num" && (cmp === "==" || cmp === "~=") && names && names.zone(b.v)) return [[`${cmp === "~=" ? "!" : ""}zone "${names.zone(b.v)}"`]];
	if (root === "AREA" && b.op === "num" && (cmp === "==" || cmp === "~=") && names && names.area(b.v)) return [[`${cmp === "~=" ? "!" : ""}subzone "${names.area(b.v)}"`]];
	// Journey reads WMOAREA from the subzone text (PARENTWMOAREA from the zone text).
	if ((root === "WMOAREA" || root === "PARENTWMOAREA") && b.op === "num" && (cmp === "==" || cmp === "~=") && names && names.wmo && names.wmo(b.v)) return [[`${cmp === "~=" ? "!" : ""}${root === "WMOAREA" ? "subzone" : "zone"} "${names.wmo(b.v)}"`]];
	// A profession: learnt (a tier of 1 or more) is rank 1; its points are the rank.
	const skill = a.op === "name" && b.op === "num" && SKILL_NAMES[a.name.replace(/_POINTS$/, "")];
	const at = skill && { ">=": b.v, ">": b.v + 1, "<": b.v, "<=": b.v + 1 }[cmp];
	if (skill && at != null && (a.name.endsWith("_POINTS") || at <= 1)) {
		const n = at;
		const pred = `skill ${skill.includes(" ") ? `"${skill}"` : skill} ${n}`;
		if (n <= 0) return cmp === ">=" || cmp === ">" ? [[]] : [];
		return [[cmp === "<" || cmp === "<=" ? "!" + pred : pred]];
	}
	if (root === "HEARTHSTONE" && key && isB(b) && !b.v && names && names.inn(key[0])) return [[`${cmp === "==" ? "!" : ""}bound "${names.inn(key[0])}"`]];
	return null;
}

// Whether a `when` list can hold at all: no predicate with its opposite.
export function consistent(whens) {
	return !whens.some((p) => whens.includes(negatePred(p)));
}

// The opposite of one `when` predicate.
function negatePred(p) {
	const m = p.match(/^(level|money)(<=|>=|<|>)(.+)$/);
	if (m) return `${m[1]}${neg[m[2]]}${m[3]}`;
	return p.startsWith("!") ? p.slice(1) : "!" + p;
}

const MAX_TERMS = 8;
// Placeholder for the quest of a `group` predicate.
export const GROUP_QUEST = "<quest>";

// Residual -> { alts: [[pred, ...], ...], unknown: [text] }: Polestar `when` lists
// of which one must hold (each list ANDs its predicates), made exclusive of the
// ones before where that takes one predicate each. A part Polestar cannot check
// counts as holding (the step then applies more often, never less) and is
// listed in `unknown`.
export function whenAlts(e, names) {
	const unknown = [];
	const and = (x, y) => {
		const out = [];
		for (const a of x) for (const b of y) out.push([...a, ...b]);
		return out;
	};
	const dnf = (x, negate) => {
		if (isB(x)) return x.v !== negate ? [[]] : [];
		if (x.op === "not") return dnf(x.a, !negate);
		if (x.op === "and" || x.op === "or") {
			const l = dnf(x.a, negate), r = dnf(x.b, negate);
			return (x.op === "and") !== negate ? and(l, r) : [...l, ...r];
		}
		const t = literalTerms(x, names, negate);
		if (!t) { unknown.push((negate ? "not " : "") + show(x)); return [[]]; }
		return t;
	};
	let terms = !e ? [[]] : dnf(e, false);
	// Tidy: dedupe, drop contradictions, absorb by an always-true term.
	terms = terms.map((t) => [...new Set(t)]).filter((t) => !t.some((p) => t.includes(negatePred(p))));
	if (terms.some((t) => !t.length)) return { alts: [[]], unknown };
	const seen = new Set();
	terms = terms.filter((t) => { const k = [...t].sort().join("&"); if (seen.has(k)) return false; seen.add(k); return true; });
	if (terms.length > MAX_TERMS) return { alts: [[]], unknown: [...unknown, `${terms.length} alternatives`] };
	// Exclusive: each term also "not" every earlier one-predicate term.
	const alts = [];
	terms.forEach((t, i) => {
		const extra = [];
		for (const prev of terms.slice(0, i)) if (prev.length === 1) extra.push(negatePred(prev[0]));
		const all = [...new Set([...t, ...extra])];
		if (!all.some((p) => all.includes(negatePred(p)))) alts.push(all);
	});
	return { alts, unknown };
}

// The single `when` list a residual comes to, or null when it needs several or
// has parts Polestar cannot check.
export function toWhens(e, names) {
	const r = whenAlts(e, names);
	return r.alts.length === 1 && !r.unknown.length ? { whens: r.alts[0] } : null;
}

// ---- the whole condition --------------------------------------------------

const cache = new Map();
function parsed(text) {
	if (!cache.has(text)) cache.set(text, parseExpr(text));
	return cache.get(text);
}

// -> [{ only: {class?, race?}, residual: AST|null, pairs }] (empty: for nobody).
// Pairs are grouped by the residual left for them; `local` reads location state
// (WITHIN, VISITED, ...) as "not yet".
export function evaluate(text, universe, opts = {}) {
	if (!text) return [{ only: {}, residual: null, pairs: universe }];
	const e = parsed(text);
	const byResidual = new Map();
	for (const p of universe) {
		const who = new Set([p.cls, p.race, p.faction]);
		const r = fold(e, who, opts);
		if (isB(r) && !r.v) continue;
		const key = isB(r) ? "" : show(r);
		if (!byResidual.has(key)) byResidual.set(key, { residual: isB(r) ? null : r, pairs: [] });
		byResidual.get(key).pairs.push(p);
	}
	const out = [];
	for (const { residual, pairs } of byResidual.values()) {
		for (const o of onlyFor(pairs, universe)) out.push({ only: o.only, residual, pairs: o.pairs });
	}
	return out;
}

// AND of two `only` objects on the same universe: names of one kind intersect.
export function andOnly(a, b) {
	const out = {};
	for (const k of ["class", "race"]) {
		if (a[k] && b[k]) out[k] = a[k].filter((x) => b[k].includes(x));
		else if (a[k] || b[k]) out[k] = a[k] || b[k];
	}
	return out;
}
