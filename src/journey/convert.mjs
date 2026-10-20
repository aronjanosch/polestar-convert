// Parsed Journey guide (src/journey/parse.mjs) -> the intermediate form
// (src/ir.mjs) plus a report of what was not carried over one to one. Ids,
// names and places come from Polestar's data; what it does not know is left out
// and listed, never guessed.

import { evaluate, pairsOf, whenAlts, consistent, onlyString, onlyFor, normalCase, RACE_NAMES, CLASS_NAMES } from "./cond.mjs";
import { worldToZone, questOpenTo, questEndPlaced, eliteOf, innNamed } from "../data.mjs";
import { render } from "../emit.mjs";
import { bare, questOf } from "../ir.mjs";

const ALONG_KINDS = new Set(["kill", "collect", "interact", "accept", "turnin", "complete", "level", "note"]);
// Journey's merchant kinds (Merchant.lua) by what Polestar does with them.
const VENDOR_KINDS = new Set(["SUPPLIES", "REPAIRS"]);
const PROFESSIONS = ["First Aid", "Cooking", "Fishing", "Herbalism", "Mining", "Skinning", "Alchemy", "Blacksmithing", "Enchanting", "Engineering", "Leatherworking", "Tailoring"];

const kv = (t) => (t && t.kv) || {};
const arr = (t) => (t && t.arr) || [];
const isTable = (t) => t && typeof t === "object" && "arr" in t;
const nameOf = (v) => (v && typeof v === "object" && v.name ? v.name : v);

// "FLAGS|map|x|y[|r]" -> { flags, uiMap, x, y, live, r } in zone percentages, or null.
function parseLocation(text, data) {
	const [flags, map, x, y, r] = String(text).split("|");
	const uiMap = Number(map);
	if (!(uiMap > 0) || x == null || y == null) return null;
	let px = Number(x), py = Number(y);
	if (flags.includes("W")) {
		// World coordinates: x is the north axis, y the west one; Polestar's frames
		// put the west axis left-right.
		const z = worldToZone(data, uiMap, py, px);
		if (!z) return null;
		px = z.x; py = z.y;
	}
	return { flags, uiMap, x: round(px), y: round(py), live: true, r: r != null ? Number(r) : null };
}
const round = (v) => Math.round(v * 100) / 100;

// Whether a text piece's condition holds where the route stands: "yes", "no"
// or "maybe" (state Polestar cannot know ahead, such as the level).
function textCond(text, pairs, ctx) {
	const vs = evaluate(text, pairs, { ...ctx.ev, local: true, route: ctx.route });
	if (!vs.length) return "no";
	return vs.some((v) => !v.residual) ? "yes" : "maybe";
}

// Text of a Journey text task: strings and inline refs, flattened. Of pieces
// that say the same thing for different states, the one for the route's state;
// where that is unknown, the first.
function textOf(node, ctx, pairs) {
	const parts = [];
	// A name written twice in a row (a word and its link) once.
	const word = (t) => {
		const w = String(t).trim();
		if (w.length > 3 && parts.join("").trimEnd().endsWith(w)) return;
		parts.push(String(t));
	};
	// A label ("NOTE:") stands apart from the words around it.
	const apart = (t) => parts.push(` ${t} `);
	const walk = (n) => {
		if (n == null) return;
		if (typeof n === "string") { word(n); return; }
		if (typeof n !== "object") { word(n); return; }
		if (!isTable(n)) return;
		const k = n.kv;
		if (k.npc != null) word(k.label || entityName(ctx, "npc", k.npc));
		else if (k.item != null) word(k.label || entityName(ctx, "item", k.item));
		else if (k.spell != null) word(k.label || entityName(ctx, "spell", k.spell));
		else if (k.quest != null) word(k.label || entityName(ctx, "quest", k.quest));
		else if (k.skipped != null) word(entityName(ctx, "quest", k.skipped) + (k.note ? ` (${k.note})` : ""));
		else if (k.gameobject != null) word(k.label || entityName(ctx, "object", k.gameobject));
		else if (k.area != null) word(k.label || (typeof k.area === "string" ? k.area : entityName(ctx, "area", k.area)));
		else if (k.wmoarea != null) word(k.label || wmoName(ctx, k.wmoarea));
		else if (k.zone != null) word(k.label || entityName(ctx, "zone", k.zone));
		else if (k.taxi != null) word(k.label || entityName(ctx, "taxi", k.taxi));
		else if (k.skill != null) word(k.label || String(k.skill));
		else if (k.illustration != null) word(k.label || "");
		else if (k.location != null) word(k.label || locationText(ctx, Number(k.location)));
		for (const f of ["red", "tip", "note"]) if (typeof k[f] === "string" && k.skipped == null) apart(k[f]);
		for (const f of ["bold", "italic"]) if (typeof k[f] === "string") word(k[f]);
		if (typeof k.paragraph === "string") apart(k.paragraph);
		if (k.newline != null) word(" ");
		let taken = false;
		for (const x of n.arr) {
			const cond = isTable(x) && x.kv.condition;
			if (!cond) { taken = false; if (isTable(x) && x.arr.length && !Object.keys(x.kv).length) word(" "); walk(x); continue; }
			const c = textCond(cond, pairs, ctx);
			if (c === "no" || (c === "maybe" && taken)) continue;
			if (c === "maybe") taken = true;
			word(" ");
			walk(x);
		}
	};
	walk(node);
	return tidy(parts.join(""));
}

// Spaces and stops as a sentence wants them.
function tidy(text) {
	// Journey's own window ("A sound alert will play ...") means nothing in Polestar.
	text = text.replace(/[^.!?]*\bsound alert\b[^.!?]*[.!?]?/gi, "");
	return text.replace(/\|c[0-9a-fA-F]{8}|\|r/g, "").replace(/\s+/g, " ").replace(/\s+([.,:;!?)])/g, "$1").replace(/\(\s+/g, "(")
		.replace(/([^.])\.\.(?!\.)/g, "$1.").replace(/([.!?:])([A-Z])/g, "$1 $2").replace(/([a-z])\(/g, "$1 (").replace(/::+/g, ":").replace(/\(see map\)\s*\(see map\)/g, "(see map)").trim();
}

// A building's name (WMOAreaTable), when the data has it.
function wmoName(ctx, id) {
	const n = ctx.names.wmo ? ctx.names.wmo(id) : null;
	if (n) return n;
	ctx.report.count("text: building (wmoarea) name unknown to the data");
	return "(see map)";
}

// The step's own location N in words: its label, the NPC there, else coordinates.
function locationText(ctx, n) {
	const l = (ctx.stepLocations || [])[n - 1];
	if (!l) return "";
	const lk = kv(l);
	const p = parseLocation(arr(l)[0], ctx.data);
	if (lk.npc != null && ctx.data.npcs[lk.npc]) return ctx.data.npcs[lk.npc].name;
	return p ? "(see map)" : "";
}

// A location's label, its "%s" filled with the place it names ("Exit: %s").
function labelOf(ctx, lk) {
	if (!lk.label) return null;
	if (!lk.label.includes("%s")) return lk.label;
	const name = lk.wmoarea != null ? ctx.names.wmo && ctx.names.wmo(lk.wmoarea)
		: lk.area != null ? (typeof lk.area === "string" ? lk.area : ctx.names.area(lk.area))
		: lk.zone != null ? ctx.names.zone(lk.zone)
		: lk.npc != null && ctx.data.npcs[lk.npc] ? ctx.data.npcs[lk.npc].name : null;
	return name ? lk.label.replace("%s", name) : null;
}

// A step title: the first sentence, at most 60 letters, cut at a word.
function titleOf(text) {
	const first = String(text).split(/(?<=[.!?:])\s/)[0];
	if (first.length <= 60) return first.replace(/:$/, "");
	const cut = first.slice(0, 58);
	return cut.slice(0, Math.max(cut.lastIndexOf(" "), 30)).replace(/[\s,;:]+$/, "") + "...";
}

// A text for each set of characters who read it alike: pieces of it may be for
// some classes or races only. -> [{ text, pairs }]
function textVariants(node, ctx, pairs) {
	const byText = new Map();
	for (const p of pairs) {
		const text = textOf(node, ctx, [p]);
		if (!text) continue;
		if (!byText.has(text)) byText.set(text, []);
		byText.get(text).push(p);
	}
	return [...byText].map(([text, ps]) => ({ text, pairs: ps }));
}

function entityName(ctx, kind, id) {
	const { data, names } = ctx;
	let n = null;
	if (kind === "npc") n = data.npcs[id] && data.npcs[id].name;
	else if (kind === "item") n = data.items[id] && data.items[id].name;
	else if (kind === "object") n = data.objects[id] && data.objects[id].name;
	else if (kind === "quest") n = data.quests[id] && data.quests[id].title;
	else if (kind === "spell") n = names.spell(id);
	else if (kind === "area") n = names.area(id);
	else if (kind === "zone") n = names.zone(id);
	else if (kind === "taxi") n = names.taxi(id) && names.taxi(id).short;
	if (n) return n;
	ctx.report.count(`text: ${kind} name unknown to the data`);
	return `${kind} ${id}`;
}

// Whether a condition holds for some of `pairs` (runtime parts read as possible;
// with `local`, location state as "not yet").
function holds(text, pairs, ctx, local) {
	return evaluate(text, pairs, { ...ctx.ev, local }).length > 0;
}

// The ids a task group names (text refs and buttons), to match quest objectives.
function refsOf(group) {
	const npcs = new Set(), items = new Set(), objects = new Set();
	const walk = (n) => {
		if (!isTable(n)) return;
		const k = n.kv;
		if (typeof k.npc === "number") npcs.add(k.npc);
		if (typeof k.item === "number") items.add(k.item);
		if (typeof k.gameobject === "number") objects.add(k.gameobject);
		if (typeof k.target === "number") npcs.add(k.target);
		for (const t of arr(k.targets)) if (typeof t === "number") npcs.add(t);
		for (const x of n.arr) walk(x);
		if (k.buttons) walk(k.buttons);
	};
	walk(group);
	return { npcs, items, objects };
}

// A quest's objective goals: the one numbered `n` (game quest-log order, as
// Polestar numbers them), all of them for `n` null; a kill/collect/interact goal
// each, or `complete Q` when the data has none of that kind.
function objectiveGoals(q, n, data, refs, ctx, stepNo) {
	const quest = data.quests[q];
	const objs = (quest && quest.objectives) || [];
	if (!objs.length) return [];
	const goalFor = (o, i) => {
		if (o.type === "kill") return { kind: "kill", npc: o.id, quest: q, oi: i + 1 };
		if (o.type === "item") return { kind: "collect", item: o.id, quest: q, oi: i + 1 };
		if (o.type === "object") return { kind: "interact", object: o.id, quest: q, oi: i + 1 };
		return null;
	};
	if (n == null) {
		const all = objs.map(goalFor);
		if (all.every(Boolean)) return all;
		return [{ kind: "complete", quest: q }];
	}
	let i = n - 1;
	const o = objs[i];
	const named = (x) => x && ((x.type === "kill" && refs.npcs.has(x.id)) || (x.type === "item" && refs.items.has(x.id)) || (x.type === "object" && refs.objects.has(x.id)));
	if (!o) {
		gapNote(ctx, stepNo, `quest ${q} has no objective ${n} in the data; whole quest used`);
		return [{ kind: "complete", quest: q }];
	}
	// Cross-check by the ids the step names: when it names another objective's
	// target and not this one's, the data numbers them differently.
	if (!named(o) && (refs.npcs.size || refs.items.size || refs.objects.size)) {
		const j = objs.findIndex((x) => named(x));
		if (j >= 0 && j !== i) {
			ctx.report.count("objective number differs from the data's; matched by the target the step names");
			i = j;
		}
	}
	const g = goalFor(objs[i], i);
	return [g || { kind: "complete", quest: q }];
}

// A condition and Journey's `completed` on the same node: it applies while the
// condition holds and it is not done yet.
function withCompleted(condition, completed) {
	if (!completed) return condition;
	return `(${condition || "true"}) and not (${completed})`;
}

// A residual -> the `when` lists of which one must hold (one list each: a copy
// of the step or goal). Parts Polestar cannot check are left out and counted;
// `where` null keeps quiet (texts).
// A gap for the report: what Journey has that the guide does not carry, by
// Journey's own step id. Also listed under "needs a look".
function gapNote(ctx, stepNo, what, line) {
	ctx.report.note(ctx.name, stepNo, what, line);
	gap(ctx, "needs a look", what + (line ? `: ${line}` : ""));
}
function gap(ctx, kind, detail) {
	ctx.gaps.push({ step: ctx.stepId || null, kind, detail: String(detail) });
}

function altsOf(residual, ctx, stepNo, where) {
	if (!residual) return [[]];
	const { alts, unknown } = whenAlts(residual, ctx.names);
	if (where) {
		if (alts.length > 1) ctx.report.count(`${where} condition with OR -> ${alts.length} copies`);
		if (alts.some((a) => a.length)) ctx.report.count(`${where} condition -> when`);
		for (const u of unknown) {
			const lit = parseLocal(u);
			if (lit) { ctx.report.count(`${where} condition on the step's location state (left out)`); gap(ctx, "location state left out", u); }
			else { ctx.report.count(`${where} condition part Polestar cannot check: ${(u.match(/[A-Z][A-Z_]+/) || ["?"])[0]} (left out)`); gapNote(ctx, stepNo, `${where} condition part left out`, u); }
		}
	}
	return alts.length ? alts : [];
}
const parseLocal = (text) => /^(not )?(WITHIN|VISITED|EXITED|ACTIVE|CHECKPOINT|COMPLETE|ROOT_COMPLETED|TGLOCATION_ENABLED)\b/.test(text);

// A step Journey shows only in a state Polestar cannot check (a spell known,
// dead, in a group): kept as an alternative, its goals optional, with a note
// saying when it applies. [] when it is not such a step.
const ALT = { SPELL: ["know", true], GHOST: ["dead", true], DEAD: ["dead", true], DEADORGHOST: ["dead", true], ALIVE: ["dead", false], INGROUP: ["grouped", true] };
function alternative(st, ctx, stepNo) {
	const sk = kv(st);
	const text = withCompleted(sk.condition, sk.completed);
	if (!text || !/\b(SPELL|GHOST|DEAD|DEADORGHOST|ALIVE|INGROUP)\b/.test(text)) return [];
	const ev = { ...ctx.ev, assume: (name, keys) => (ALT[name] ? ALT[name][1] : assume(ctx, name, keys)) };
	const variants = evaluate(text, ctx.universe, ev);
	if (!variants.length) return [];
	const why = [];
	for (const m of String(sk.condition || "").matchAll(/(not\s+)?SPELL\[(\d+)\]/g)) if (!m[1]) why.push(`you know ${entityName(ctx, "spell", Number(m[2]))}`);
	if (/\b(GHOST|DEAD|DEADORGHOST)\b/.test(sk.condition || "")) why.push("you are dead");
	if (/\bINGROUP\b/.test(sk.condition || "")) why.push("you are in a group");
	const out = [];
	for (const v of variants) for (const whens of altsOf(v.residual, ctx, stepNo, "step")) {
		for (const s of buildVariant(st, stepNo, ctx, v.only, v.pairs, whens)) {
			if (!s.title && s.tips[0]) s.title = titleOf(s.tips[0]);
			s.goals = [
				{ kind: "note", text: `Only if ${why.length ? why.join(" and ") : "Journey's condition holds"}: otherwise use Skip.`, only: "" },
				...s.goals,
			];
			out.push(s);
		}
	}
	if (out.length) {
		ctx.report.count("step for a state Polestar cannot check -> kept, note: only if ..., else Skip");
		gap(ctx, "step for a state Polestar cannot check (note: only if ..., else Skip)", why.join(", ") || sk.condition);
	}
	return out;
}

function buildStep(st, stepNo, ctx) {
	const { data, report, names, universe } = ctx;
	const sk = kv(st);
	const out = [];
	// A step Journey counts as done already (`completed`) is one that does not apply.
	const variants = evaluate(withCompleted(sk.condition, sk.completed), universe, ctx.ev);
	if (sk.completed) report.count("step `completed` -> when not");
	if (!variants.length) {
		const alt = alternative(st, ctx, stepNo);
		if (alt.length) return alt;
		report.count("step: for no Forever character (dropped)");
		return out;
	}
	for (const v of variants) {
		for (const whens of altsOf(v.residual, ctx, stepNo, "step")) out.push(...buildVariant(st, stepNo, ctx, v.only, v.pairs, whens));
	}
	return out;
}

function buildVariant(st, stepNo, ctx, stepOnly, stepPairs, stepWhens) {
	const { data, report, names } = ctx;
	const sk = kv(st);
	ctx.stepLocations = arr(sk.locations);

	// Places: the step's locations a Forever character sees.
	const places = [];
	for (const l of arr(sk.locations)) {
		const lk = kv(l);
		if (lk.condition && !holds(lk.condition, stepPairs, ctx, true)) continue;
		const p = parseLocation(arr(l)[0], data);
		if (!p) { report.count("location without a map frame (dropped)"); continue; }
		if (p.flags.includes("H")) continue;
		// For everyone, or only for some (a Druid's way to Moonglade).
		const forAll = !lk.condition || evaluate(lk.condition, stepPairs, { ...ctx.ev, local: true }).reduce((n, v) => n + v.pairs.length, 0) === stepPairs.length;
		places.push({ ...p, npc: lk.npc, object: lk.gameobject, label: labelOf(ctx, lk), forAll });
	}
	const npcPlace = (id) => places.find((p) => p.npc === id) || null;
	const objectPlace = (id) => places.find((p) => p.object === id) || null;
	const mapId = (places.find((p) => p.forAll) || {}).uiMap || ctx.lastMap || (places[0] || {}).uiMap;
	const lastForAll = [...places].reverse().find((p) => p.forAll);
	if (lastForAll && stepPairs.length === ctx.universe.length) ctx.lastMap = lastForAll.uiMap;
	const atOf = (p) => (p ? { x: p.x, y: p.y, live: p.live, map: p.uiMap !== mapId ? p.uiMap : undefined } : undefined);

	const wayIn = [...places].reverse().find((p) => !p.npc && !p.object) || null;
	// Chunks: goals in the source's order, one per Journey task group (so its words
	// stay with its goals), split where the `when` they need changes.
	const chunks = [];
	let groupNo = 0;
	const chunk = (whens) => {
		const key = groupNo + "#" + whens.join("|");
		const last = chunks[chunks.length - 1];
		if (last && last.key === key) return last;
		const c = { key, whens, goals: [], tips: [], notes: [], along: [], title: null };
		chunks.push(c);
		return c;
	};
	const main = chunk([]);
	let title = null;
	let format = 4;
	const eliteTips = [];

	arr(st).forEach((group) => {
		if (!isTable(group)) return;
		const gk = kv(group);
		if (!arr(group).length) return; // buttons only
		// The banner at a guide's end ("... is complete!").
		if (gk.bordercolor === "GUIDE_COMPLETE") { report.count("guide-complete banner (left out)"); return; }
		groupNo++;
		// Location state ("inside the church") read as on arrival: not yet.
		const gVariants = evaluate(withCompleted(gk.condition, gk.completed), stepPairs, { ...ctx.ev, local: true });
		if (!gVariants.length) return;
		const refs = refsOf(group);
		const merchantHere = arr(group).some((x) => isTable(x) && x.kv.merchant != null);
		const npcsHere = arr(group).filter((t) => isTable(t) && typeof t.kv.npc === "number" && Object.keys(t.kv).length <= 2).map((t) => t.kv.npc);
		const cands = [...npcsHere, ...refs.npcs, ...places.map((p) => p.npc).filter(Boolean)];
		const roleNpc = (role) => cands.find((id) => data.npcs[id] && (data.npcs[id].roles || []).includes(role)) || null;
		// A class trainer by the title the data gives them ("Warlock Trainer").
		const trainerOf = (cls) => cands.find((id) => data.npcs[id] && data.npcs[id].subName === `${cls} Trainer`) || null;
		// A vendor of the step who sells the item.
		const sellerOf = (item) => cands.find((id) => ((data.items[item] || {}).vendors || []).includes(id)) || null;
		// "Skip This?" offered beside the group's goals: they never hold the route.
		const skippable = arr(group).some((x) => isTable(x) && x.kv.button != null && x.kv.goto === "next" && x.kv.optional === true);
		for (const gv of gVariants) for (const gWhens of altsOf(gv.residual, ctx, stepNo, "group")) {
			const groupPairs = gv.pairs;
			const before = chunks.map((c) => c.goals.length);
			// Buttons that do something: destroy an item, use the Hearthstone.
			for (const b of arr(gk.buttons)) {
				const bk = kv(b);
				if (bk.condition && !holds(bk.condition, groupPairs, ctx, false)) continue;
				if (bk.destroy != null) {
					const item = Number(bk.destroy);
					if (ctx.native.has("destroy") && data.items[item]) { chunk(gWhens).goals.push({ kind: "destroy", item, only: "" }); format = Math.max(format, 6); report.count("destroy button -> destroy"); }
					else { chunk(gWhens).goals.push({ kind: "task", text: `Destroy ${entityName(ctx, "item", item)}`, only: "" }); format = Math.max(format, 5); report.count("destroy button -> task"); }
				} else if (bk.item != null && data.items[bk.item] && data.items[bk.item].name === "Hearthstone") {
					// Where to: the inn the text names, else where the guide last bound.
					const said = (textOf(group, ctx, groupPairs).match(/Hearth(?:stone)? (?:back )?to ([A-Z][\w' ]+?)(?:[.,:(]|$)/) || [])[1];
					const inn = said ? innNamed(data, said, null) : null;
					const location = inn ? inn.location : ctx.bind;
					if (location) { chunk(gWhens).goals.push({ kind: "hearth", location, only: "" }); report.count("hearthstone button -> hearth"); }
					else { report.count("hearthstone button, place unknown (text only)"); gap(ctx, "hearth, place unknown", textOf(group, ctx, groupPairs)); }
				} else if (bk.spell != null) {
					// A spell to cast: Polestar cannot see it, the player ticks it.
					chunk(gWhens).goals.push({ kind: "task", text: `Cast ${entityName(ctx, "spell", bk.spell)}`, only: "" });
					format = Math.max(format, 5);
					report.count("spell button -> task");
					gap(ctx, "cast (no goal in Polestar)", `spell ${bk.spell}`);
				} else if (bk.item != null && data.items[bk.item]) {
					// A helper beside the step's goals, which check the work: a note, not a task to tick.
					chunk(gWhens).goals.push({ kind: "note", text: `Use ${data.items[bk.item].name}`, only: "" });
					report.count("item button -> note");
					gap(ctx, "use item (no goal Polestar checks here)", `item ${bk.item}`);
				}
			}
			let textTaken = false;
			for (const task of arr(group)) {
				const tk = isTable(task) ? task.kv : {};
				const isTextTask = typeof task === "string" || !Object.keys(tk).some((k) => k !== "condition" && k !== "color");
				if (isTextTask) {
					// Words: for the route's state; of alternatives Polestar cannot tell apart, the first.
					if (!tk.condition) textTaken = false;
					else {
						const c = textCond(tk.condition, groupPairs, ctx);
						if (c === "no" || (c === "maybe" && textTaken)) continue;
						if (c === "maybe") textTaken = true;
					}
					for (const tv of evaluate(tk.condition, groupPairs, { ...ctx.ev, local: true, route: ctx.route })) {
						for (const o of onlyFor(tv.pairs, stepPairs)) addTask(task, { c: chunk(gWhens), only: onlyString(o.only), ctx, stepNo, pairs: o.pairs, stepPairs });
					}
					continue;
				}
				// Who and when for this task, inside the group.
				const tVariants = evaluate(tk.condition, groupPairs, ctx.ev);
				for (const tv of tVariants) for (const tWhens of altsOf(tv.residual, ctx, stepNo, "task")) {
					const whens = [...new Set([...gWhens, ...tWhens])];
					for (const o of onlyFor(tv.pairs, stepPairs)) {
						const c = chunk(whens);
						addTask(task, { c, only: onlyString(o.only), ctx, stepNo, refs, roleNpc, npcPlace, objectPlace, atOf, mapId, setTitle: (t) => { if (!c.title) c.title = t; if (!title) title = t; }, eliteTips, format: (f) => { format = Math.max(format, f); }, pairs: o.pairs, stepPairs, gk, group, merchantHere, trainerOf, sellerOf, wayIn });
					}
				}
			}
			// "Grind to level N" with nothing else to do: Journey's `completed` is the goal.
			const lv = String(gk.completed || "").match(/^\s*LEVEL\s*>=\s*(\d+)\s*$/);
			if (lv && !arr(group).some((t) => isTable(t) && !isText(t) && t.kv.npc == null)) {
				chunk(gWhens).goals.push({ kind: "level", level: Number(lv[1]), only: "" });
				report.count("group `completed` LEVEL >= N -> level");
			}
			if (skippable) {
				// Journey offers to skip the step; Polestar's Skip does that. Optional goals
				// would not do: a step of optional goals only is passed at once.
				const c = chunk(gWhens);
				if (!c.goals.some((g) => g.kind === "note" && /use Skip/.test(g.text))) c.goals.unshift({ kind: "note", text: "Journey offers to skip this step: use Skip if you want to.", only: "" });
				report.count("\"Skip This?\" -> note (Polestar's Skip)");
			}
		}
	});
	const lv = String(sk.completed || "").match(/^\s*LEVEL\s*>=\s*(\d+)\s*$/);
	if (lv && !chunks.some((c) => c.goals.some((g) => g.kind !== "note"))) {
		main.goals.push({ kind: "level", level: Number(lv[1]), only: "" });
		report.count("step `completed` LEVEL >= N -> level");
	}

	// Waypoints: checkpoints (doors, a search round), and pins without an NPC.
	const path = places.filter((p) => p.flags.includes("C") && !p.npc && !p.object);
	const spots = places.filter((p) => !p.flags.includes("C") && !p.npc && !p.object);
	// Words of a chunk with no goals of its own go with the next goals (else the last).
	for (let i = 0; i < chunks.length; i++) {
		const c = chunks[i];
		if (c.goals.length || c.along.length) continue;
		const to = chunks.slice(i + 1).find((x) => x.goals.length) || [...chunks.slice(0, i)].reverse().find((x) => x.goals.length);
		if (!to) continue;
		to.tips.unshift(...c.tips);
		to.notes.unshift(...c.notes);
		c.tips = [];
		c.notes = [];
	}
	const first = chunks.find((c) => c.goals.length) || chunks[0];

	const steps = [];
	const base = (c) => ({
		stepNo, journeyId: ctx.stepId, title: null, only: stepOnly, whens: [...new Set([...stepWhens, ...c.whens])], goals: c.goals, tips: c.tips, notes: c.notes,
		// A step with no place of its own keeps the zone it is in.
		maps: mapId && places.length ? [mapId] : [], loop: [], label: null, completesWith: null, allAlong: false, format,
	});
	const gotoOf = (p) => ({ kind: "goto", x: p.x, y: p.y, live: p.live, map: p.uiMap !== mapId ? p.uiMap : undefined, r: p.r > 0 ? p.r : undefined, text: p.label ? bare(p.label).slice(0, 40) : undefined, only: "" });
	for (const c of chunks) {
		// Work begun here and finished in a later step: an along step before this one.
		if (c.along.length) {
			const key = (g) => `${g.kind}:${g.quest}:${g.oi}:${g.only}`;
			const fresh = c.along.filter((g) => !ctx.alongOpen.has(key(g)));
			for (const g of fresh) ctx.alongOpen.add(key(g));
			const words = c.goals.length ? [] : [...c.tips];
			if (!c.goals.length) c.tips = [];
			if (fresh.length) {
				steps.push({ ...base(c), goals: fresh, tips: words, notes: [], title: words[0] ? titleOf(words[0]) : title ? `${title} (along the way)` : null, completesWith: "next", allAlong: fresh.every((g) => ALONG_KINDS.has(g.kind)) });
				report.count("startwork -> along");
			} else report.count("startwork already along (not repeated)");
		}
		if (!c.goals.length && !c.tips.length && !c.notes.length) continue;
		const s = base(c);
		if (c === first) {
			s.tips = [...eliteTips, ...c.tips];
			const work = s.goals.some((g) => ["kill", "collect", "interact", "complete"].includes(g.kind) && !g.at);
			const target = s.goals.map((g) => placeOfGoal(data, g, mapId)).find(Boolean);
			if (work) {
				// Journey's points around the work: where to search, as Polestar's loop.
				const pts = [...path, ...spots].filter((p) => p.uiMap === mapId);
				if (pts.length >= 2) { s.loop = pts.map((p) => ({ x: p.x, y: p.y, live: p.live, uiMap: p.uiMap })); report.count("work step: Journey's points -> loop"); }
			} else if (s.goals.length) {
				// The way in (doors, stairs): points with a radius, not where the goal itself leads.
				const lead = path.filter((p) => p.r > 0 && !(target && p.uiMap === mapId && yards(data, mapId, p, target) < 45)).map(gotoOf);
				if (lead.length) { s.goals = [...lead, ...s.goals]; report.count("checkpoints -> goto before the step's goals", lead.length); }
			} else if (path.length || spots.length) {
				s.goals = path.length ? path.map(gotoOf) : [gotoOf(spots[0])];
				report.count("text-only step with places -> goto");
			}
		}
		if (!s.goals.length) {
			// Words only: kept as a task the player ticks.
			s.goals = [{ kind: "task", text: s.tips[0] || s.notes[0], only: "" }];
			s.tips = s.tips.slice(1);
			s.format = Math.max(s.format, 5);
			report.count("text-only step -> task");
		}
		for (const g of s.goals) if (g.quest != null) for (const k of [...ctx.alongOpen]) if (k.split(":")[1] === String(g.quest)) ctx.alongOpen.delete(k);
		s.tips = [...new Set(s.tips)];
		s.notes = [...new Set(s.notes)];
		s.title = c.title || (s.tips[0] ? titleOf(s.tips[0]) : title);
		steps.push(s);
	}
	return steps;
}

// Spawn points of the data in the live frame of `map` (zone percentages).
function livePts(data, spawn, map) {
	if (!spawn) return [];
	const era = (data.frames.era || {})[map], live = (data.frames.forever || {})[map];
	if (spawn.f !== "e" || !era || !live) return spawn.pts.map(([x, y]) => ({ x, y }));
	return spawn.pts.map(([x, y]) => {
		const wx = era.left - (x / 100) * (era.left - era.right), wy = era.top - (y / 100) * (era.top - era.bottom);
		return { x: ((live.left - wx) / (live.left - live.right)) * 100, y: ((live.top - wy) / (live.top - live.bottom)) * 100 };
	});
}
function yards(data, map, a, b) {
	const f = (data.frames.forever || {})[map] || (data.frames.era || {})[map];
	if (!f) return Infinity;
	return Math.hypot(((a.x - b.x) / 100) * (f.left - f.right), ((a.y - b.y) / 100) * (f.top - f.bottom));
}
// Where Polestar will lead for a goal on `map`, from the data: the giver, ender,
// vendor or trainer; null when it does not say.
function placeOfGoal(data, g, map) {
	if (g.at) return g.at.map == null || g.at.map === map ? g.at : null;
	let npc = g.npc;
	if (g.kind === "accept" || g.kind === "turnin") {
		const q = data.quests[g.quest];
		const ends = q && (g.kind === "accept" ? q.start : q.end);
		npc = ends && (ends.npc || [])[0];
	}
	if (npc == null || !["accept", "turnin", "vendor", "train"].includes(g.kind)) return null;
	const n = data.npcs[npc];
	return (livePts(data, n && n.spawns && n.spawns[map], map))[0] || null;
}

function addTask(task, t) {
	const { c, only, ctx, stepNo, refs, roleNpc, npcPlace, objectPlace, atOf } = t;
	const { data, report } = ctx;
	const goal = (g) => {
		const q = g.quest != null ? data.quests[g.quest] : null;
		if (q && !questOpenTo(data, q, ctx.faction, null)) {
			report.count("goal for a quest the data closes to this faction (dropped)");
			return;
		}
		const elite = eliteOf(data, g);
		if (elite) {
			const tip = `${elite} is elite: grouping up is advised.`;
			if (!t.eliteTips.includes(tip)) t.eliteTips.push(tip);
			report.count(`${g.kind} of elite work -> optional`);
		}
		c.goals.push({ ...g, only: g.only != null ? g.only : only, optional: g.optional || elite ? true : undefined });
	};
	if (typeof task === "string" || (isTable(task) && isText(task))) {
		for (const v of textVariants(task, ctx, t.pairs)) {
			if (v.pairs.length === t.stepPairs.length) { c.tips.push(bare(v.text)); continue; }
			for (const o of onlyFor(v.pairs, t.stepPairs)) c.goals.push({ kind: "note", text: bare(v.text), only: onlyString(o.only) });
			report.count("class-specific text -> note");
		}
		return;
	}
	if (!isTable(task)) return;
	const k = task.kv;
	const optional = k.optional === true ? true : undefined;
	if (k.accept != null || k.turnin != null) {
		const kind = k.accept != null ? "accept" : "turnin";
		const id = Number(k[kind]);
		const q = data.quests[id];
		if (!q) { report.count(`${kind}: quest unknown to the data (dropped)`); gapNote(ctx, stepNo, `quest ${id} unknown to Polestar's data; ${kind} left out`); return; }
		if (kind === "accept") ctx.seen.add(id);
		else ctx.turned.add(id);
		t.setTitle(q.title);
		const ends = kind === "accept" ? q.start : q.end;
		if (questEndPlaced(data, ends)) goal({ kind, quest: id, optional });
		else {
			// The giver has no spawn in the data: Journey's own place for them.
			const giver = ((ends && ends.npc) || []).map(npcPlace).find(Boolean) || ((ends && ends.object) || []).map(objectPlace).find(Boolean);
			// Else the last point of the step's way in (a dungeon's or a tram's entrance).
			const place = giver || t.wayIn;
			if (!place) { report.count(`${kind}: giver without a spawn, no place (dropped)`); gapNote(ctx, stepNo, `quest ${id}: the data has no spawn for its ${kind === "accept" ? "giver" : "ender"} and the step no place; ${kind} left out`); return; }
			goal({ kind, quest: id, optional, at: atOf(place) });
			report.count(giver ? `${kind}: giver without a spawn, placed at Journey's location` : `${kind}: giver without a spawn, placed at the step's way in`);
			if (!giver) gapNote(ctx, stepNo, `quest ${id}: ${kind} placed at the step's last waypoint (check)`);
		}
		return;
	}
	if (k.complete != null || k.startwork != null) {
		const id = Number(k.complete != null ? k.complete : k.startwork);
		const q = data.quests[id];
		if (!q) { report.count("complete: quest unknown to the data (dropped)"); gapNote(ctx, stepNo, `quest ${id} unknown to Polestar's data; work left out`); return; }
		const ns = k.objective != null ? [Number(k.objective)] : k.objectives ? arr(k.objectives).map(Number) : [null];
		const goals = ns.flatMap((n) => objectiveGoals(id, n, data, refs, ctx, stepNo));
		if (!goals.length) { report.count("complete on a quest without objectives (dropped)"); return; }
		if (k.startwork != null) {
			for (const g of goals) c.along.push({ ...g, only });
			return;
		}
		for (const g of goals) goal({ ...g, optional });
		return;
	}
	if (k.getitem != null) {
		const item = Number(k.getitem);
		const count = k.quantity != null ? Number(k.quantity) : 1;
		const qid = k.questid != null ? Number(k.questid) : null;
		const opt = optional || (typeof k.completed === "string" && /MONEY/.test(k.completed)) ? true : undefined;
		const itemName = data.items[item] ? undefined : entityName(ctx, "item", item);
		// Picked up before the quest is taken: counted in the bags.
		if (qid && data.quests[qid] && !ctx.seen.has(qid) && !ctx.acceptsLater.has(qid)) {
			const seller = t.sellerOf(item);
			goal(seller ? { kind: "buy", item, itemName, count, npc: seller, optional: opt } : { kind: "collect", item, itemName, count, optional: opt });
			report.count("getitem before its quest is taken -> bag count");
			return;
		}
		if (qid && data.quests[qid]) {
			const objs = data.quests[qid].objectives || [];
			const oi = objs.findIndex((o) => o.type === "item" && o.id === item);
			const seller = t.sellerOf(item);
			if (oi >= 0 && seller) { goal({ kind: "buy", item, itemName, count: objs[oi].count || count, npc: seller, optional: opt }); report.count("getitem a vendor of the step sells -> buy"); return; }
			if (oi >= 0) { goal({ kind: "collect", item, itemName, quest: qid, oi: oi + 1, optional: opt }); return; }
		}
		const vendor = t.sellerOf(item) || roleNpc("vendor");
		const sold = data.items[item] && (data.items[item].vendors || []).length;
		if (sold && (vendor || t.merchantHere)) {
			goal({ kind: "buy", item, itemName, count, npc: vendor && (data.items[item].vendors || []).includes(vendor) ? vendor : undefined, optional: opt });
			report.count("getitem sold by a vendor -> buy");
		} else goal({ kind: "collect", item, itemName, count, optional: opt });
		return;
	}
	if (k.merchant != null) {
		const m = nameOf(k.merchant);
		if (VENDOR_KINDS.has(m)) {
			const npc = roleNpc(m === "REPAIRS" ? "repair" : "vendor") || roleNpc("vendor");
			goal({ kind: "vendor", npc: npc || undefined, optional, comment: m === "SUPPLIES" ? "resupply: food and drink" : "repair" });
			report.count(npc ? `merchant ${m} -> vendor <npc>` : `merchant ${m} -> vendor nearest`);
		} else if (m === "TALENTS") {
			// Each class at its own trainer, where the step names one.
			const byNpc = new Map();
			for (const p of t.pairs) {
				const npc = t.trainerOf(CLASS_NAMES[p.cls]);
				if (!byNpc.has(npc)) byNpc.set(npc, []);
				byNpc.get(npc).push(p);
			}
			for (const [npc, ps] of byNpc) {
				for (const o of onlyFor(ps, t.stepPairs)) {
					goal(npc ? { kind: "train", npc, optional, only: onlyString(o.only) } : { kind: "train", class: true, optional, only: onlyString(o.only) });
					report.count(npc ? "merchant TALENTS -> train <npc>" : "merchant TALENTS -> train class");
				}
			}
		} else if (m === "WEAPONSKILLS") {
			const npc = roleNpc("trainer");
			if (npc) { goal({ kind: "train", npc, optional }); report.count(`merchant ${m} -> train <npc>`); }
			else { goal({ kind: "task", text: "Learn new weapon skills at a weapon master", optional }); t.format(5); report.count("merchant WEAPONSKILLS, trainer unknown -> task"); }
		} else if (m === "TRADESKILLS") {
			const text = textOf(t.group, ctx, t.pairs);
			const prof = PROFESSIONS.find((p) => new RegExp(`\\b${p}\\b`, "i").test(text));
			const npc = roleNpc("trainer");
			if (prof && data.hasProfessions) { goal({ kind: "train", profession: prof, npc: npc || undefined, optional }); report.count("merchant TRADESKILLS -> train <Profession>"); }
			else if (npc) { goal({ kind: "train", npc, optional }); report.count("merchant TRADESKILLS -> train <npc>"); }
			else { goal({ kind: "task", text: "Train your profession", optional }); t.format(5); report.count("merchant TRADESKILLS, trainer unknown -> task"); }
		} else {
			goal({ kind: "task", text: m === "STABLEIN" ? "Stable your pet" : "Take your pet out of the stable", optional });
			t.format(5);
			report.count(`merchant ${m} -> task`);
		}
		return;
	}
	if (k.level != null) {
		const level = Number(k.level), xp = k.xp != null ? Number(k.xp) : undefined;
		// Polestar counts XP into a level by the 1.12 table; past its end, the next level.
		const need = ctx.names.levelXp(level);
		if (xp != null && need != null && xp >= need) { goal({ kind: "level", level: level + 1, optional }); report.count("level+xp past Polestar's XP table -> next level"); }
		else goal({ kind: "level", level, xp, optional });
		return;
	}
	if (k.learntaxi != null || k.taketaxi != null) {
		const kind = k.learntaxi != null ? "getfp" : "fly";
		const node = ctx.names.taxi(k.learntaxi != null ? k.learntaxi : k.taketaxi);
		if (node) { goal({ kind, location: node.short, optional }); report.count(`${k.learntaxi != null ? "learntaxi" : "taketaxi"} -> ${kind}`); }
		else { report.count(`${kind}: taxi node unknown to the data (dropped)`); gapNote(ctx, stepNo, `taxi node ${k.learntaxi ?? k.taketaxi} unknown`); }
		return;
	}
	if (k.sethearthstone != null || k.hearth != null) {
		const area = k.sethearthstone != null ? k.sethearthstone : k.hearth;
		const inn = ctx.names.inn(area);
		const kind = k.sethearthstone != null ? "sethome" : "hearth";
		if (inn) { goal({ kind, location: inn, optional }); ctx.bind = inn; report.count(`${k.sethearthstone != null ? "sethearthstone" : "hearth"} -> ${kind}`); }
		else if (kind === "sethome") { goal({ kind, optional }); report.count("sethearthstone: inn of that area unknown -> sethome nearest"); gapNote(ctx, stepNo, `no inn with area ${area} in the data`); }
		else { report.count("hearth: inn unknown (dropped)"); }
		return;
	}
	if (k.die || k.spiritres) {
		goal({ kind: "task", text: k.die ? "Die on purpose to get back faster (death skip)" : "Resurrect at the spirit healer", optional });
		t.format(5);
		report.count(`${k.die ? "die" : "spiritres"} -> task`);
		return;
	}
	if (k.deposit || k.withdraw) {
		const items = task.arr.filter((x) => isTable(x) && x.kv.item != null).map((x) => entityName(ctx, "item", x.kv.item));
		goal({ kind: "task", text: `${k.deposit ? "Put in the bank" : "Take from the bank"}: ${items.join(", ")}`, optional });
		t.format(5);
		report.count(`${k.deposit ? "deposit" : "withdraw"} -> task`);
		return;
	}
	if (k.button != null) {
		if (k.goto === "next" && k.optional === true) { gap(ctx, "skip choice (note: use Skip)", k.button); return; }
		if (k.guide == null && k.goto == null) { report.count("button without a jump (ignored)"); return; }
		const skip = /^(skip|i already did|click when done|click for next)/i.test(String(k.button).trim());
		c.goals.push({ kind: "note", text: skip ? `Journey offers "${bare(k.button).replace(/\?$/, "")}" here: use Skip if it applies.` : `Choice in Journey: "${bare(k.button)}".`, only });
		report.count("jump button -> note");
		gap(ctx, "jump the player chooses (note only)", `${k.button} -> ${k.guide ? k.guide + " " : ""}${k.goto || ""}`);
		return;
	}
	if (k.npc != null || k.gameobject != null || k.fromnpc != null) return; // who to talk to: the goals beside it say it
	if (k.text != null) {
		const text = textOf({ arr: [String(k.text)], kv: {} }, ctx, t.pairs);
		if (text) c.tips.push(bare(text));
		return;
	}
	report.count(`task {${Object.keys(k).join(",")}} (unknown, ignored)`);
}

// A task table that is text: no key but condition, color and formatting ones.
const TEXT_KEYS = new Set(["condition", "color", "icon", "bold", "red", "tip", "italic", "note", "paragraph", "newline", "skipped", "scale", "illustration"]);
function isText(t) {
	return Object.keys(t.kv).every((k) => TEXT_KEYS.has(k));
}

// A runtime value Polestar cannot check, as the route's normal case: Journey's
// own markers (`VAR.X`) are set once a step before this one has set them on
// completion; the rest per normalCase. -> value or undefined (left as is).
function assume(ctx, name, keys) {
	const root = name.split(".")[0];
	let v;
	if (root === "VAR") v = ctx.varsSet.has(name);
	else v = normalCase(root);
	// Only while converting a step (not when reading the guide's hand-offs).
	if (v !== undefined && ctx.stepId) {
		if (!ctx.assumed.has(root)) ctx.assumed.set(root, new Set());
		ctx.assumed.get(root).add(ctx.stepId);
	}
	return v;
}

export function convertGuide(info, guide, data, opts) {
	const { report, slug, packId, names } = opts;
	const faction = info.faction === "Alliance" || info.faction === "Horde" ? info.faction : null;
	const universe = pairsOf(data, faction);
	const ctx = {
		data, names, report, universe, faction, fixed: opts.fixed || {}, name: info.description || info.guideID,
		seen: new Set(opts.before || []), turned: new Set(), alongOpen: new Set(), gaps: [],
		// Where the route stands, for texts: taken 1, handed in 3, else 0.
		route: (q) => (ctx.turned.has(q) ? 3 : ctx.seen.has(q) ? 1 : 0),
		// Conditions read with Forever's fixed names and its quests.
		ev: { fixed: opts.fixed || {}, questKnown: (id) => !!data.quests[id], assume: (name, keys) => assume(ctx, name, keys) },
		varsSet: new Set(), assumed: new Map(), native: opts.native || new Set(), jumps: new Set(), lastMap: Number(info.zone) || null, bind: null,
	};
	// Where the guide's buttons lead on ("Go to 6-12 ..."): its hand-offs, the last
	// one first. A button shown only when the guide is finished counts.
	const jumpFixed = { ...ctx.fixed, COMPLETEONSTART: true, INCOMPLETEONSTART: false };
	for (const st of arr(guide)) {
		if (!isTable(st) || !evaluate(kv(st).condition, universe, { ...ctx.ev, fixed: jumpFixed, local: true }).length) continue;
		for (const g of arr(st)) for (const t of arr(g)) {
			if (!isTable(t) || t.kv.guide == null) continue;
			if (evaluate(t.kv.condition, universe, { ...ctx.ev, fixed: jumpFixed, local: true }).length) ctx.jumps.add(String(t.kv.guide));
		}
	}
	// Quests this guide accepts anywhere (an item picked up before the accept still counts).
	ctx.acceptsLater = new Set();
	const walkAccepts = (n) => { if (!isTable(n)) return; if (typeof n.kv.accept === "number") ctx.acceptsLater.add(n.kv.accept); n.arr.forEach(walkAccepts); };
	walkAccepts(guide);
	const steps = [];
	arr(guide).forEach((st, i) => {
		if (!isTable(st)) return;
		ctx.stepNo = i + 1;
		ctx.stepId = kv(st).id || `#${i + 1}`;
		for (const s of buildStep(st, i + 1, ctx)) steps.push(s);
		// Markers this step sets when done (`oncomplete = "VAR.X = true"`) hold from here on.
		for (const node of [st, ...arr(st)]) {
			for (const m of String(kv(node).oncomplete || "").matchAll(/(VAR\.[A-Za-z0-9_]+)\s*=\s*true/g)) ctx.varsSet.add(m[1]);
		}
	});
	// A goal for a quest this guide has not accepted by then: its own step, only
	// while the quest is in the log.
	const accepted = new Set(opts.before || []);
	const out = [];
	const turned = new Set();
	// Goals about quests a copy asserts handed in: nothing to do there.
	const doneIn = (x) => new Set(x.whens.map((w) => (w.match(/^turnedin (\d+)$/) || [])[1]).filter(Boolean).map(Number));
	for (const x of steps) {
		const done = doneIn(x);
		if (!done.size) continue;
		const keep = x.goals.filter((g) => !(g.quest != null && done.has(g.quest) && ["accept", "turnin", "complete", "kill", "collect", "interact"].includes(g.kind)));
		if (keep.length !== x.goals.length) { report.count("goals for a quest the copy has handed in (dropped)"); x.goals = keep; }
	}
	const doneAlready = (x) => {
		// A copy for "already handed in" whose work is all about those quests: nothing left to do.
		const done = x.whens.map((w) => (w.match(/^turnedin (\d+)$/) || [])[1]).filter(Boolean).map(Number);
		const work = x.goals.filter((g) => g.kind !== "goto" && g.kind !== "note");
		return (done.length && work.length && work.every((g) => done.includes(g.quest))) || (done.length && !work.length);
	};
	const live = steps.filter((x) => {
		if (!consistent(x.whens)) { report.count("step whose `when` lists contradict (no character sees it, dropped)"); return false; }
		if (doneAlready(x)) { report.count("step for quests already handed in (dropped)"); return false; }
		return true;
	});
	let carry = [], carryNotes = [];
	for (const s0 of live) {
		const s = { ...s0, goals: [] };
		for (const g of s0.goals) {
			const q = g.quest != null ? data.quests[g.quest] : null;
			// A turn-in of a quest the route has handed in already (a slip in the source).
			if (g.kind === "turnin" && turned.has(g.quest) && !s.whens.length && !g.only && !g.optional) {
				report.count("turn-in of a quest already handed in (dropped)");
				gapNote(ctx, s.stepNo, `turnin ${g.quest} again after it was handed in; left out (check the source)`);
				continue;
			}
			// An accept whose prerequisite the route has taken but not handed in, at the
			// NPC that ends it: the hand-in the source leaves out.
			if (g.kind === "accept" && q) {
				const startNpcs = (q.start && q.start.npc) || [];
				for (const pre of [...(q.preAll || []), ...(q.pre || [])]) {
					const p = data.quests[pre];
					if (!p || !accepted.has(pre) || turned.has(pre) || s.goals.some((x) => x.kind === "turnin" && x.quest === pre)) continue;
					if (!((p.end && p.end.npc) || []).some((n) => startNpcs.includes(n))) continue;
					s.goals.push({ kind: "turnin", quest: pre, only: g.only });
					turned.add(pre);
					report.count("turn-in of a prerequisite the source leaves out (added)");
				}
			}
			if (g.kind === "turnin" && !s.whens.length && !g.only && !g.optional) turned.add(g.quest);
			s.goals.push(g);
		}
		// Words of a step left with no goals go with the next one.
		if (carry.length || carryNotes.length) { s.tips = [...carry, ...s.tips]; s.goals = [...carryNotes, ...s.goals]; carry = []; carryNotes = []; }
		if (!s.goals.some((g) => g.kind !== "note")) {
			// Words for some characters only stay notes for them; the step's own `only` goes with them.
			const own = onlyString(s.only || {});
			carry = own ? [] : [...s.tips];
			carryNotes = [...(own ? s.tips.map((t) => ({ kind: "note", text: t, only: own })) : []), ...s.goals.map((g) => (own && !g.only ? { ...g, only: own } : g))];
			continue;
		}
		// In the step's order: a turn-in after its accept in the same step is fine.
		const lost = [], rest = [];
		for (const g of s.goals) {
			const q = questOf(g);
			if (g.kind === "accept") accepted.add(g.quest);
			(q != null && !accepted.has(q) ? lost : rest).push(g);
		}
		if (!lost.length) { out.push(s); continue; }
		const ids = [...new Set(lost.map(questOf))];
		report.count(`goals for quests not accepted before -> when onquest (${lost.length})`);
		const work = rest.some((g) => g.kind !== "goto");
		if (work) out.push({ ...s, goals: rest });
		const whens = [...s.whens, `onquest ${ids.join(",")}`];
		if (ids.length > 1 || consistent(whens)) out.push({ ...s, goals: work ? lost : [...rest, ...lost], whens, tips: work ? [] : s.tips });
	}

	// A step nothing holds (notes and optional goals only) is passed at once:
	// a manual task keeps it in front of the player until ticked or skipped.
	for (const s of out) {
		if (s.goals.some((g) => g.kind !== "note" && !g.optional)) continue;
		const text = s.tips[0] || (s.goals.find((g) => g.kind === "note") || {}).text || s.title;
		if (!text) continue;
		if (s.tips[0] === text) s.tips = s.tips.slice(1);
		s.goals.push({ kind: "task", text, only: "" });
		s.format = Math.max(s.format, 5);
		report.count("step with nothing that holds it -> manual task");
		ctx.gaps.push({ step: s.journeyId || null, kind: "manual task (nothing Polestar checks)", detail: text.slice(0, 80) });
	}

	const title = String(info.description || "").replace(/^\d+-\d+\s+/, "") || info.guideID;
	// A starting guide (from level 1) is for the races Journey recommends it to.
	let races = [];
	if (String(info.levels || "").startsWith("1-") && info.recommended) {
		const set = new Set();
		for (const v of evaluate(info.recommended, universe, ctx.ev)) for (const p of v.pairs) set.add(RACE_NAMES[p.race]);
		if (set.size && set.size < new Set(universe.map((p) => p.race)).size) races = [...set];
	}
	// A guide for some classes only (the catalog's condition).
	const who = evaluate(info.condition, universe, ctx.ev);
	const classes = who.length === 1 && who[0].only.class ? who[0].only.class : null;
	const ir = {
		name: ctx.name,
		title,
		faction,
		classes,
		races,
		levels: info.levels || null,
		zone: names.zone(info.zone),
		defaultMap: Number(info.zone) || null,
		category: "Leveling",
		folder: `Journey ${String(info.group || "").trim()}`.trim(),
		sourceSteps: arr(guide).length,
		steps: out,
	};
	for (const [k, steps] of ctx.assumed) report.count(`steps with a condition on ${k} read as the route's normal case`, steps.size);
	const r = render(ir, { report, slug, packId, next: opts.next || [] });
	for (const [k, steps] of ctx.assumed) for (const id of steps) ctx.gaps.push({ step: id, kind: "read as the route's normal case", detail: k });
	return { ...r, jumps: [...ctx.jumps].reverse(), accepted, gaps: ctx.gaps };
}
