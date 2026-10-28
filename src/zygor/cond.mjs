// Zygor conditions (`|only if <expr>`, a bare `|only <list>`, `|complete <expr>`)
// into Polestar `only` lists, `when` predicates and goals.
//
// Zygor's expressions are Lua-like: `or`, `and`, `not`, parentheses, calls
// `f(args)`, comparisons, and juxtaposition as AND (`Scourge Warlock`); in a
// bare list a comma is an OR. An expression is read into a small formula
// (true / false / who / predicate / and / or / "no form"), negated by pushing
// `not` inward, then flattened to what Polestar can say. What it cannot say is
// dropped and named in `dropped`, never half-kept.

import { CLASSES, RACES, FACTIONS, canon } from "../cond.mjs";

export const GUIDEFLAGS = {
	RFCflag: "Ragefire Chasm", WCflag: "Wailing Caverns", DMflag: "The Deadmines", SFKflag: "Shadowfang Keep",
	BFDflag: "Blackfathom Deeps", Stockflag: "The Stockade", Gnomerflag: "Gnomeregan", SMflag: "Scarlet Monastery",
	ZFflag: "Zul'Farrak", Maraflag: "Maraudon",
};
const UNIVERSE = { class: CLASSES, race: RACES, faction: FACTIONS };
const KINDS = ["class", "race", "faction"];
const STANDINGS = ["Neutral", "Friendly", "Honored", "Revered", "Exalted"];
const SKILLS = ["Alchemy", "Blacksmithing", "Enchanting", "Engineering", "Herbalism", "Leatherworking", "Mining", "Skinning", "Tailoring", "Cooking", "Fishing", "First Aid"];
const FALSE_NAMES = new Set(["hardcore", "selfmade"]);

// ---- parsing ---------------------------------------------------------------

function tokenize(text) {
	// "Night Elf" is one name; the space would read as an AND.
	const s = String(text).replace(/\{\s*\}/g, "").replace(/\bNight\s+Elf\b/gi, "NightElf");
	const out = [];
	const re = /\s*(?:(\d+(?:\.\d+)?)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|([A-Za-z_][A-Za-z_0-9]*(?:[.:][A-Za-z_][A-Za-z_0-9]*)*)|(==|~=|!=|<=|>=|[<>=(),]))/y;
	let i = 0;
	while (i < s.length) {
		if (/^\s*$/.test(s.slice(i))) break;
		re.lastIndex = i;
		const m = re.exec(s);
		if (!m) throw new Error(`zygor condition: cannot read "${s.slice(i, i + 20)}" in "${s}"`);
		i = re.lastIndex;
		if (m[1]) out.push({ t: "num", v: Number(m[1]) });
		else if (m[2]) out.push({ t: "str", v: m[2].slice(1, -1) });
		else if (m[3]) out.push(["and", "or", "not"].includes(m[3]) ? { t: m[3] } : { t: "name", v: m[3] });
		else out.push({ t: m[4] === "=" ? "==" : m[4] === "!=" ? "~=" : m[4] });
	}
	return out;
}

// -> AST: {op:"or"|"and", items} | {op:"not", a} | {op:"cmp", cmp, a, b}
//    | {op:"call", name, args} | {op:"name", name} | {op:"num"|"str", v}
function parse(text) {
	const toks = tokenize(text);
	let p = 0;
	const peek = () => toks[p] || { t: "eof" };
	const isCall = (tok) => tok.t === "name" && toks[p + 1]?.t === "(" && !canon(tok.v);

	function orExpr() {
		const items = [andExpr()];
		while (peek().t === "or" || peek().t === ",") { p++; items.push(andExpr()); }
		return items.length === 1 ? items[0] : { op: "or", items };
	}
	function andExpr() {
		const items = [notExpr()];
		for (;;) {
			const k = peek();
			if (k.t === "and") p++;
			else if (!(k.t === "name" || k.t === "(" || k.t === "not")) break;
			items.push(notExpr());
		}
		return items.length === 1 ? items[0] : { op: "and", items };
	}
	function notExpr() {
		if (peek().t === "not") { p++; return { op: "not", a: notExpr() }; }
		return cmpExpr();
	}
	function cmpExpr() {
		const a = primary();
		if (["==", "~=", "<", "<=", ">", ">="].includes(peek().t)) {
			const cmp = toks[p++].t;
			return { op: "cmp", cmp, a, b: primary() };
		}
		return a;
	}
	function primary() {
		const k = peek();
		if (k.t === "(") {
			p++;
			const e = orExpr();
			if (peek().t !== ")") throw new Error(`zygor condition: expected ) in "${text}"`);
			p++;
			return e;
		}
		if (k.t === "num") { p++; return { op: "num", v: k.v }; }
		if (k.t === "str") { p++; return { op: "str", v: k.v }; }
		if (k.t === "name") {
			if (isCall(k)) {
				p += 2;
				const args = [];
				while (peek().t !== ")") {
					if (peek().t === "eof") throw new Error(`zygor condition: unclosed call in "${text}"`);
					if (peek().t === ",") { p++; continue; }
					args.push(cmpExpr());
				}
				p++;
				return { op: "call", name: k.v, args };
			}
			p++;
			return { op: "name", name: k.v };
		}
		throw new Error(`zygor condition: unexpected ${k.t} in "${text}"`);
	}

	if (!toks.length) return null;
	const ast = orExpr();
	if (p < toks.length) throw new Error(`zygor condition: trailing ${toks[p].t} in "${text}"`);
	return ast;
}

// ---- formulas --------------------------------------------------------------
// {t:"bool",v} | {t:"only",kind,list} | {t:"when",pos,neg} | {t:"and"|"or",items}
// | {t:"drop",reasons}   ("no form": holds as far as Polestar can tell)

const bool = (v) => ({ t: "bool", v });
const drop = (...reasons) => ({ t: "drop", reasons });
const when = (pos, neg) => ({ t: "when", pos, neg });

function reasonsOf(f) {
	if (f.t === "drop") return f.reasons;
	if (f.t === "and" || f.t === "or") return f.items.flatMap(reasonsOf);
	return [];
}

function negate(f) {
	// A term with a part Polestar cannot see has no honest opposite: drop all of it.
	const lost = reasonsOf(f);
	if (lost.length) return drop(...lost);
	switch (f.t) {
		case "bool": return bool(!f.v);
		case "only": return { t: "only", kind: f.kind, list: UNIVERSE[f.kind].filter((n) => !f.list.includes(n)) };
		case "when": return when(f.neg, f.pos);
		case "and": return { t: "or", items: f.items.map(negate) };
		case "or": return { t: "and", items: f.items.map(negate) };
	}
}

const kindOf = (name) => KINDS.find((k) => UNIVERSE[k].includes(name));
const flip = { "<": ">=", "<=": ">", ">": "<=", ">=": "<" };
const quote = (s) => (/\s/.test(s) ? `"${s}"` : s);
const strArg = (e) => (e && (e.op === "str" ? e.v : e.op === "name" ? e.name : null));

function nameOf(e) {
	return e.op === "name" ? e.name : e.op === "call" ? e.name : e.op === "cmp" ? nameOf(e.a) : e.op;
}

function evalName(name, read) {
	const low = name.toLowerCase();
	if (FALSE_NAMES.has(low)) return bool(false);
	// Zygor's `walking` is "not on a flight" (Parser.lua: not IsFlying()); Classic has no
	// flying mount, so it holds whenever the player can act on a step.
	if (low === "walking") { read.push("walking"); return bool(true); }
	if (low === "indoors") return drop(low);
	// The Season of Discovery and of Mastery are other clients than Classic Era's.
	if (low === "zgv.isclassicsod" || low === "zgv.isclassicsom") { read.push("season"); return bool(false); }
	// `default`: the trainer for everyone no `dist(...)` line picked; Polestar picks the nearest.
	if (low === "default") { read.push("nearest"); return bool(true); }
	const c = canon(name);
	if (c) return { t: "only", kind: kindOf(c), list: [c] };
	if (low === "level") return drop("level");
	return drop(name);
}

function skillWhen(prof, cmp, n) {
	const p = SKILLS.find((s) => s.toLowerCase() === String(prof).toLowerCase());
	if (!p) return drop("skill");
	// Polestar's `skill P N` holds from rank N up; rank 0 counts as not learned.
	let from;
	if (cmp === ">=") from = n;
	else if (cmp === ">") from = n + 1;
	else if (cmp === "<") from = n;
	else if (cmp === "<=") from = n + 1;
	else if (cmp === "==" && n === 0) from = 1, cmp = "<";
	else if (cmp === "~=" && n === 0) from = 1, cmp = ">=";
	else return drop("skill");
	from = Math.max(from, 1);
	const w = `skill ${quote(p)} ${from}`;
	return cmp === ">=" || cmp === ">" ? when(w, "!" + w) : when("!" + w, w);
}

function itemWhen(id, cmp, n) {
	let from;
	let has = true;
	if (cmp === ">=") from = n;
	else if (cmp === ">") from = n + 1;
	else if (cmp === "<") { from = n; has = false; }
	else if (cmp === "<=") { from = n + 1; has = false; }
	else if (cmp === "==" && n === 0) { from = 1; has = false; }
	else if (cmp === "~=" && n === 0) from = 1;
	else return drop("itemcount");
	from = Math.max(from, 1);
	const w = `has ${id}${from > 1 ? ` x${from}` : ""}`;
	return has ? when(w, "!" + w) : when("!" + w, w);
}

function evalCall(e, read) {
	const name = e.name.toLowerCase();
	const ids = e.args.map((a) => (a.op === "num" ? a.v : null));
	const allIds = ids.length > 0 && ids.every((v) => v !== null);
	switch (name) {
		case "hardcore": case "selfmade": return bool(false);
		case "indoors": return drop("indoors");
		case "haveq": {
			if (!allIds) return drop(name);
			const w = `onquest ${ids.join(",")}`;
			return when(w, "!" + w);
		}
		case "completedallq": {
			if (!allIds) return drop(name);
			return { t: "and", items: ids.map((id) => when(`turnedin ${id}`, `!turnedin ${id}`)) };
		}
		case "completedq": {
			if (!allIds) return drop(name);
			const items = ids.map((id) => when(`turnedin ${id}`, `!turnedin ${id}`));
			return items.length === 1 ? items[0] : { t: "and", items };
		}
		case "readyq": {
			// In the log and ready to turn in (Parser.lua: q.complete and q.inlog).
			if (ids.length !== 1 || ids[0] === null) return drop(name);
			return when(`complete ${ids[0]}`, `!complete ${ids[0]}`);
		}
		case "zone": case "subzone": {
			const z = strArg(e.args[0]);
			if (e.args.length !== 1 || !z) return drop(name);
			return when(`${name} "${z}"`, `!${name} "${z}"`);
		}
		case "discountgold": {
			// "Can afford N copper" (Parser.lua: with a 10% discount from Honored with the faction;
			// Polestar has no reputation predicate, so the full price).
			const n = e.args[1]?.op === "num" ? e.args[1].v : null;
			if (e.args.length !== 2 || n === null) return drop(name);
			read.push("discountgold");
			return when(`money>=${n}`, `money<${n}`);
		}
		case "guideflag": {
			const d = GUIDEFLAGS[strArg(e.args[0])];
			return d ? when(`dungeon "${d}"`, `!dungeon "${d}"`) : drop(name);
		}
		default: return drop(e.name);
	}
}

function evalCmp(e, read) {
	const { cmp, a, b } = e;
	// `dist("Zone x,y") < N`: the nearest of several trainers, which Polestar picks itself.
	if (a.op === "call" && a.name.toLowerCase() === "dist") { read.push("nearest"); return bool(true); }
	if (b.op !== "num") return drop(nameOf(a));
	const n = b.v;
	if (a.op === "name" && a.name.toLowerCase() === "level" || a.op === "call" && a.name.toLowerCase() === "level" && !a.args.length) {
		if (!(cmp in flip)) return drop("level");
		return when(`level${cmp}${n}`, `level${flip[cmp]}${n}`);
	}
	if (a.op === "call") {
		const name = a.name.toLowerCase();
		if (name === "itemcount" && a.args.length === 1 && a.args[0].op === "num") return itemWhen(a.args[0].v, cmp, n);
		if (name === "skill" && a.args.length === 1 && strArg(a.args[0])) return skillWhen(strArg(a.args[0]), cmp, n);
	}
	return drop(nameOf(a));
}

const isCall = (e, name) => e.op === "call" && e.name.toLowerCase() === name;

function evaluate(e, read) {
	const ev = (x) => evaluate(x, read);
	switch (e.op) {
		case "or": return { t: "or", items: e.items.map(ev) };
		case "and": {
			// `subzone("X") and indoors()`: in the cave or building that is X. Polestar sees the
			// subzone; the steps that ask it are the ways into and out of that place.
			if (e.items.some((i) => isCall(i, "indoors")) && e.items.some((i) => isCall(i, "subzone"))) {
				read.push("indoors");
				return { t: "and", items: e.items.filter((i) => !isCall(i, "indoors")).map(ev) };
			}
			return { t: "and", items: e.items.map(ev) };
		}
		case "not": return negate(ev(e.a));
		case "name": return evalName(e.name, read);
		case "call": return evalCall(e, read);
		case "cmp": return evalCmp(e, read);
		default: return drop(e.op);
	}
}

// ---- flattening -------------------------------------------------------------

// A formula made only of who-lists -> {kind: list}, else null.
function whoOf(f) {
	if (f.t === "only") return { [f.kind]: f.list };
	if (f.t !== "and") return null;
	const out = {};
	for (const i of f.items) {
		const w = whoOf(i);
		if (!w) return null;
		for (const k of Object.keys(w)) out[k] = out[k] ? out[k].filter((n) => w[k].includes(n)) : w[k];
	}
	return out;
}

function flatten(f, st) {
	switch (f.t) {
		case "bool": if (!f.v) st.never = true; return;
		case "drop": for (const r of f.reasons) st.dropped.push(r); return;
		case "when": st.whens.push(f.pos); return;
		case "only": {
			const cur = st.allowed[f.kind];
			st.allowed[f.kind] = cur ? cur.filter((n) => f.list.includes(n)) : f.list.slice();
			return;
		}
		case "and": for (const i of f.items) flatten(i, st); return;
		case "or": {
			const items = f.items.filter((i) => !(i.t === "bool" && !i.v));
			if (!items.length) { st.never = true; return; }
			if (items.some((i) => i.t === "bool")) return;
			if (items.length === 1) return flatten(items[0], st);
			// Polestar's `only` ORs names of one kind; any other OR has no form, and
			// keeping one side of it would hide the step from people it is for.
			const kind = items[0].t === "only" ? items[0].kind : null;
			if (kind && items.every((i) => i.t === "only" && i.kind === kind)) {
				const list = UNIVERSE[kind].filter((n) => items.some((i) => i.list.includes(n)));
				return flatten({ t: "only", kind, list }, st);
			}
			// "(Orc Hunter) or (Troll Hunter)": who-lists that differ in one kind only.
			const sets = items.map(whoOf);
			if (sets.every(Boolean)) {
				const differ = KINDS.filter((k) => new Set(sets.map((w) => (w[k] || []).join())).size > 1);
				if (differ.length <= 1) {
					for (const k of KINDS) {
						if (!sets[0][k]) continue;
						const list = differ[0] === k ? UNIVERSE[k].filter((n) => sets.some((w) => (w[k] || UNIVERSE[k]).includes(n))) : sets[0][k];
						flatten({ t: "only", kind: k, list }, st);
					}
					return;
				}
			}
			// "haveq(1) or haveq(2)": any of them in the log, one `onquest` list.
			if (items.every((i) => i.t === "when" && /^onquest [\d,]+$/.test(i.pos))) {
				return flatten({ t: "when", pos: `onquest ${items.map((i) => i.pos.slice(8)).join(",")}` }, st);
			}
			// An OR of predicates: one alternative per way it can hold, none overlapping (see exclusive).
			if (items.every(pureWhen)) { st.alts.push(exclusive(items.flatMap(dnf))); return; }
			st.dropped.push("or");
		}
	}
}

// ---- alternatives -------------------------------------------------------------
// Polestar's `when` lines are an AND. An OR becomes several copies of the step, one per
// alternative, each a list of `when`s; no two can hold at once, so the player meets one.

const pureWhen = (f) => f.t === "when" || ((f.t === "and" || f.t === "or") && f.items.every(pureWhen));

// A formula of `when`s -> its alternatives: [[pred, ...], ...].
function dnf(f) {
	if (f.t === "when") return [[f.pos]];
	if (f.t === "or") return f.items.flatMap(dnf);
	return f.items.map(dnf).reduce((acc, alts) => acc.flatMap((a) => alts.map((b) => [...a, ...b])), [[]]);
}

// The opposite of one predicate.
export function negWhen(p) {
	const m = /^(level|money)(<=|>=|<|>)(.+)$/.exec(p);
	if (m) return `${m[1]}${flip[m[2]]}${m[3]}`;
	return p.startsWith("!") ? p.slice(1) : "!" + p;
}

// What one predicate says about a quest's others: handed in is not in the log, ready is in it.
function implied(p) {
	let m = /^turnedin (\d+)$/.exec(p);
	if (m) return [`!onquest ${m[1]}`, `!complete ${m[1]}`];
	if ((m = /^complete (\d+)$/.exec(p))) return [`onquest ${m[1]}`, `!turnedin ${m[1]}`];
	if ((m = /^onquest (\d+)$/.exec(p))) return [`!turnedin ${m[1]}`];
	if ((m = /^!onquest (\d+)$/.exec(p))) return [`!complete ${m[1]}`];
	return [];
}

function closure(alt) {
	const out = new Set(alt);
	for (let grew = true; grew;) {
		grew = false;
		for (const p of [...out]) for (const q of implied(p)) if (!out.has(q)) { out.add(q); grew = true; }
	}
	return out;
}

// p cannot hold beside the predicates in `all`: its opposite is there, or another place
// (the player is in one zone and one subzone at a time).
function clash(p, all) {
	if (all.has(negWhen(p))) return true;
	const m = /^(zone|subzone) (.+)$/.exec(p);
	return !!m && [...all].some((q) => q !== p && q.startsWith(m[1] + " ") && !q.startsWith("!"));
}

// An alternative without what follows from the rest of it; null when it cannot hold.
export function tidy(alt) {
	const all = closure(alt);
	if ([...all].some((p) => clash(p, all))) return null;
	const kept = [...new Set(alt)];
	return kept.filter((p) => !kept.some((q) => q !== p && closure([q]).has(p)));
}

// Alternatives that may overlap -> ones that cannot: each takes the opposite of those before it.
export function exclusive(alts) {
	const out = [], before = [];
	for (const a of alts) {
		let pieces = [tidy(a)].filter(Boolean);
		for (const c of before) {
			pieces = pieces.flatMap((p) => {
				const all = closure(p);
				if (c.some((l) => clash(l, all))) return [p]; // never both
				if (c.every((l) => all.has(l))) return []; // c holds whenever p does
				const rest = [], pre = [];
				for (const l of c) {
					if (!all.has(l)) { const t = tidy([...p, ...pre, negWhen(l)]); if (t) rest.push(t); }
					pre.push(l);
				}
				return rest;
			});
		}
		out.push(...pieces);
		before.push(a);
	}
	return out;
}

// Two lists of alternatives, both to hold: every pair (each list is exclusive, so is this).
export function crossAlts(a, b) {
	if (!a.length) return b;
	if (!b.length) return a;
	return a.flatMap((x) => b.map((y) => tidy([...x, ...y])).filter(Boolean));
}

// -> { only: {class?, race?, faction?}, whens: string[], alts: string[][], never: bool,
//      dropped: string[], read: string[] }
// `alts`: the ways an OR can hold (see exclusive), [] without one; `read`: conditions
// read as something Polestar has (walking, indoors, discountgold).
export function translate(expr, ctx = {}) {
	const st = { allowed: {}, whens: [], alts: [], never: false, dropped: [] };
	const read = [];
	const ast = parse(String(expr || "").replace(/^\s*if\b/, ""));
	if (ast) flatten(evaluate(ast, read), st);
	const only = {};
	for (const kind of KINDS) {
		const list = st.allowed[kind];
		if (!list) continue;
		if (!list.length) st.never = true;
		else if (list.length < UNIVERSE[kind].length) only[kind] = UNIVERSE[kind].filter((n) => list.includes(n));
	}
	const alts = st.alts.reduce(crossAlts, []);
	if (st.alts.length && !alts.length) st.never = true;
	return { only, whens: [...new Set(st.whens)], alts, never: st.never, dropped: [...new Set(st.dropped)], read: [...new Set(read)] };
}

// ---- |complete ---------------------------------------------------------------

// `|complete <expr>` -> the goal Polestar can check, or null (a task then).
export function completeGoal(expr) {
	let ast;
	try { ast = parse(expr); } catch { return null; }
	if (!ast) return null;
	if (ast.op === "call") {
		const name = ast.name.toLowerCase();
		const s = strArg(ast.args[0]);
		if ((name === "zone" || name === "subzone") && ast.args.length === 1 && s) return { kind: "enter", place: s };
		if (name === "hasprof" && s) {
			const n = ast.args[1] ? (ast.args[1].op === "num" ? ast.args[1].v : null) : 1;
			const skill = SKILLS.find((k) => k.toLowerCase() === s.toLowerCase());
			return skill && n !== null ? { kind: "skill", skill, n } : null;
		}
		return null;
	}
	if (ast.op !== "cmp" || ast.a.op !== "call") return null;
	const a = ast.a;
	const name = a.name.toLowerCase();
	const rhs = ast.b;
	// A standing to reach: `rep("X") >= Friendly`, or Zygor's `== Friendly` once reached.
	if (name === "rep" && (ast.cmp === ">=" || ast.cmp === "==") && a.args.length === 1 && strArg(a.args[0]) && rhs.op === "name") {
		const standing = STANDINGS.find((s) => s.toLowerCase() === rhs.name.toLowerCase());
		return standing ? { kind: "rep", faction: strArg(a.args[0]), standing } : null;
	}
	if (ast.cmp !== ">=" || rhs.op !== "num") return null;
	if (name === "skill" && a.args.length === 1 && strArg(a.args[0])) {
		const skill = SKILLS.find((k) => k.toLowerCase() === strArg(a.args[0]).toLowerCase());
		return skill ? { kind: "skill", skill, n: rhs.v } : null;
	}
	if (name === "_g.getmoney" && !a.args.length) return { kind: "money", copper: rhs.v };
	if (name === "itemcount" && a.args.length === 1 && a.args[0].op === "num") return { kind: "collect", item: a.args[0].v, count: rhs.v };
	return null;
}
