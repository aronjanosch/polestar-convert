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
// Assumed to hold while the route is walked: the step stays, the condition is reported.
const ASSUMED = new Set(["walking", "indoors"]);
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

function evalName(name) {
	const low = name.toLowerCase();
	if (FALSE_NAMES.has(low)) return bool(false);
	if (ASSUMED.has(low)) return drop(low);
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

function evalCall(e) {
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
		case "guideflag": {
			const d = GUIDEFLAGS[strArg(e.args[0])];
			return d ? when(`dungeon "${d}"`, `!dungeon "${d}"`) : drop(name);
		}
		default: return drop(e.name);
	}
}

function evalCmp(e) {
	const { cmp, a, b } = e;
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

function evaluate(e) {
	switch (e.op) {
		case "or": return { t: "or", items: e.items.map(evaluate) };
		case "and": return { t: "and", items: e.items.map(evaluate) };
		case "not": return negate(evaluate(e.a));
		case "name": return evalName(e.name);
		case "call": return evalCall(e);
		case "cmp": return evalCmp(e);
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
			st.dropped.push("or");
		}
	}
}

// -> { only: {class?, race?, faction?}, whens: string[], never: bool, dropped: string[] }
export function translate(expr, ctx = {}) {
	const st = { allowed: {}, whens: [], never: false, dropped: [] };
	const ast = parse(String(expr || "").replace(/^\s*if\b/, ""));
	if (ast) flatten(evaluate(ast), st);
	const only = {};
	for (const kind of KINDS) {
		const list = st.allowed[kind];
		if (!list) continue;
		if (!list.length) st.never = true;
		else if (list.length < UNIVERSE[kind].length) only[kind] = UNIVERSE[kind].filter((n) => list.includes(n));
	}
	return { only, whens: [...new Set(st.whens)], never: st.never, dropped: [...new Set(st.dropped)] };
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
	if (ast.op !== "cmp" || ast.cmp !== ">=" || ast.a.op !== "call") return null;
	const a = ast.a;
	const name = a.name.toLowerCase();
	const rhs = ast.b;
	if (name === "rep" && a.args.length === 1 && strArg(a.args[0]) && rhs.op === "name") {
		const standing = STANDINGS.find((s) => s.toLowerCase() === rhs.name.toLowerCase());
		return standing ? { kind: "rep", faction: strArg(a.args[0]), standing } : null;
	}
	if (rhs.op !== "num") return null;
	if (name === "skill" && a.args.length === 1 && strArg(a.args[0])) {
		const skill = SKILLS.find((k) => k.toLowerCase() === strArg(a.args[0]).toLowerCase());
		return skill ? { kind: "skill", skill, n: rhs.v } : null;
	}
	if (name === "_g.getmoney" && !a.args.length) return { kind: "money", copper: rhs.v };
	if (name === "itemcount" && a.args.length === 1 && a.args[0].op === "num") return { kind: "collect", item: a.args[0].v, count: rhs.v };
	return null;
}
