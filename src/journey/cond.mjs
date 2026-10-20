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
// Runtime names: anything that is neither fixed nor who the character is.
const RUNTIME = new Set(["QUEST", "OBJECTIVE", "OBJECTIVECOUNT", "ITEM", "BANKITEM", "LEVEL", "LEVELD", "XP", "XPMAX", "MONEY",
	"SPELL", "PETSPELL", "SPELLCAST", "HASTAXI", "HEARTHSTONE", "ZONE", "AREA", "WMOAREA", "PARENTWMOAREA", "CONTINENT", "BUFF", "BUFFCOUNT", "DEBUFF", "REP",
	"VAR", "GUIDE", "SESSION", "INDOORS", "OUTDOORS", "ONTAXI", "INGROUP", "ALIVE", "DEAD", "DEADORGHOST", "GHOST", "DIED", "SPIRITRESSED",
	"RESUPPLIED", "REPAIRED", "TALENTTRAINER", "TRADESKILLTRAINER", "WEAPONSKILLTRAINER", "PETSTABLE", "TAXITAKEN", "FLYING", "FLYINGMOUNT",
	"INVEHICLE", "HINTLEVEL", "SPOILER", "HASRETURNGUIDE", "RANGED", "RANGEDSUBCLASS", ...LOCAL_STATE]);
// Profession skills, their tiers and weapon kinds: runtime values too (Condition.lua).
const PROFESSIONS = ["FIRSTAID", "COOKING", "FISHING", "HERBALISM", "MINING", "SKINNING", "ALCHEMY", "BLACKSMITHING", "ENCHANTING", "ENGINEERING", "LEATHERWORKING", "TAILORING"];
for (const p of PROFESSIONS) { RUNTIME.add(p); RUNTIME.add(p + "_POINTS"); }
for (const n of ["APPRENTICE", "JOURNEYMAN", "EXPERT", "ARTISAN", "BOWS", "CROSSBOW", "GUNS", "THROWN", "WANDS"]) RUNTIME.add(n);
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
			if (opts.fixed && n in opts.fixed) { const v = opts.fixed[n]; return typeof v === "number" ? { op: "num", v } : B(!!v); }
			if (n in FIXED) { const v = FIXED[n]; return typeof v === "number" ? { op: "num", v } : B(v); }
			if (n in QUEST_STATES) return { op: "num", v: QUEST_STATES[n] };
			if (n in CLASS_NAMES || n in RACE_NAMES || n === "HORDE" || n === "ALLIANCE") return B(who.has(n));
			if (RUNTIME.has(rootName(e))) return opts.local && LOCAL_STATE.has(n) ? (n === "ACTIVE" || n === "CHECKPOINT" ? { op: "num", v: 0 } : B(false)) : e;
			if (GUIDE_ID.test(n)) return B(true);
			// Any other name (TBC, WOTLK, SOD2, SOM1, JOYOUS, DEV, ...) is unset on Forever.
			return B(false);
		}
		case "index": {
			const keys = e.keys.map((k) => fold(k, who, opts));
			const ne = { ...e, keys };
			if (opts.local && LOCAL_STATE.has(rootName(e))) return B(false);
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

// A quest state set ({0,1,2,3}) -> `when` predicates that hold for exactly
// those states, or null. NONE 0, ACCEPTED 1, COMPLETED 2, TURNEDIN 3.
const QUEST_SETS = {
	"3": ["turnedin"], "0,1,2": ["!turnedin"], "1,2": ["onquest"], "0,3": ["!onquest"], "2": ["complete"],
	"0,1,3": ["!complete"], "0": ["!onquest", "!turnedin"], "0,1": ["!complete", "!turnedin"], "1": ["onquest", "!complete"],
	"0,2": null, "0,2,3": null, "1,3": null,
};
// Sets with no exact form, close enough for the steps they guard: "has or had it"
// is `onquest` (a step for a quest already handed in is done anyway).
const QUEST_NEAR = { "1,2,3": ["onquest"], "2,3": ["complete"], "0,1,2,3": [] };

function questWhen(cmp, value, q) {
	const states = [0, 1, 2, 3].filter((s) => compare(cmp, s, value));
	const key = states.join(",");
	if (QUEST_SETS[key]) return { preds: QUEST_SETS[key].map((p) => `${p} ${q}`) };
	if (QUEST_NEAR[key]) return { preds: QUEST_NEAR[key].map((p) => `${p} ${q}`), near: true };
	return null;
}

const flip = { "<": ">", "<=": ">=", ">": "<", ">=": "<=", "==": "==", "~=": "~=" };
const neg = { "<": ">=", "<=": ">", ">": "<=", ">=": "<", "==": "~=", "~=": "==" };

// One literal (a comparison, an index, or `not` of one) -> { preds, near? } | null.
// `names` resolves zones and areas to the names Polestar compares.
function literalWhen(e, names, negate = false) {
	if (e.op === "not") return literalWhen(e.a, names, !negate);
	if (e.op === "index" || e.op === "name") return literalWhen({ op: "cmp", cmp: "~=", a: e, b: B(false) }, names, negate);
	if (e.op !== "cmp") return null;
	let { cmp, a, b } = e;
	if (isConst(a) && !isConst(b)) { [a, b] = [b, a]; cmp = flip[cmp]; }
	if (negate) cmp = neg[cmp];
	const key = a.op === "index" && a.keys.every(isConst) ? a.keys.map((k) => k.v) : null;
	const root = a.op === "index" ? a.name : a.op === "name" ? a.name : null;
	if (root === "QUEST" && key && b.op === "num") return questWhen(cmp, b.v, key[0]);
	if ((root === "LEVEL" || root === "LEVELD") && b.op === "num") {
		if (cmp === "==") return { preds: [`level>=${b.v}`, `level<${b.v + 1}`] };
		if (cmp === "~=") return null;
		return { preds: [`level${cmp}${b.v}`] };
	}
	if (root === "MONEY" && b.op === "num" && cmp !== "==" && cmp !== "~=") return { preds: [`money${cmp}${b.v}`] };
	if (root === "ITEM" && key && b.op === "num") {
		const n = b.v;
		const has = (k) => (k <= 1 ? `has ${key[0]}` : `has ${key[0]} x${k}`);
		const not = (k) => "!" + has(k);
		if (cmp === ">=") return { preds: n <= 0 ? [] : [has(n)] };
		if (cmp === ">") return { preds: [has(n + 1)] };
		if (cmp === "<") return { preds: n <= 0 ? null : [not(n)] };
		if (cmp === "<=") return { preds: [not(n + 1)] };
		if (cmp === "==" && n === 0) return { preds: [not(1)] };
		if (cmp === "~=" && n === 0) return { preds: [has(1)] };
		return null;
	}
	if (root === "ITEM" && key && isB(b) && !b.v) return { preds: [cmp === "==" ? `!has ${key[0]}` : `has ${key[0]}`] };
	if (root === "ZONE" && b.op === "num" && (cmp === "==" || cmp === "~=") && names && names.zone(b.v)) return { preds: [`${cmp === "~=" ? "!" : ""}zone "${names.zone(b.v)}"`] };
	if (root === "AREA" && b.op === "num" && (cmp === "==" || cmp === "~=") && names && names.area(b.v)) return { preds: [`${cmp === "~=" ? "!" : ""}subzone "${names.area(b.v)}"`] };
	if (root === "HEARTHSTONE" && key && isB(b) && !b.v && names && names.inn(key[0])) return { preds: [`${cmp === "==" ? "!" : ""}bound "${names.inn(key[0])}"`] };
	return null;
}

// Residual -> { whens: [...], near: bool } when it is a conjunction of literals
// Polestar can check; else null.
export function toWhens(e, names) {
	if (!e || (isB(e) && e.v)) return { whens: [], near: false };
	const parts = [];
	const walk = (x) => { if (x.op === "and") { walk(x.a); walk(x.b); } else parts.push(x); };
	walk(e);
	const whens = [];
	let near = false;
	for (const p of parts) {
		// `onquest a or onquest b` is Polestar's `onquest a,b`.
		if (p.op === "or") {
			const ors = [];
			const w2 = (x) => { if (x.op === "or") { w2(x.a); w2(x.b); } else ors.push(x); };
			w2(p);
			const lits = ors.map((o) => literalWhen(o, names));
			if (lits.every((l) => l && l.preds.length === 1 && /^onquest \d+$/.test(l.preds[0]))) {
				whens.push("onquest " + lits.map((l) => l.preds[0].split(" ")[1]).join(","));
				near = near || lits.some((l) => l.near);
				continue;
			}
			return null;
		}
		const l = literalWhen(p, names);
		if (!l || !l.preds) return null;
		whens.push(...l.preds);
		near = near || !!l.near;
	}
	return { whens: [...new Set(whens)], near };
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
