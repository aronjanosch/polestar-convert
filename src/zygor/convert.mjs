// Zygor guide (src/zygor/parse.mjs) -> the intermediate form (src/ir.mjs), then
// rendered by src/emit.mjs. The player sees what Zygor shows: a step's goals
// hold until done, ticked or skipped. A line Zygor only displays becomes a tip,
// or a task when its step has no goal. Nothing is guessed: an id the data does
// not know is quoted by name or the line becomes text, and the report says so.

import { translate, completeGoal } from "./cond.mjs";
import { refs } from "./parse.mjs";
import { onlyText, andOnly, canon, RACES, CLASSES } from "../cond.mjs";
import { zoneIdNamed, zoneName, questEndPlaced, questOpenTo, journalPlace, innNamed, flightNamed, goalPlaced } from "../data.mjs";
import { resolveObjective } from "../objective.mjs";
import { render } from "../emit.mjs";

const SKILLS = ["Alchemy", "Blacksmithing", "Cooking", "Enchanting", "Engineering", "Fishing", "First Aid", "Herbalism", "Leatherworking", "Mining", "Skinning", "Tailoring"];
// Mods whose condition Polestar has no form for: the line is kept, the condition gapped.
const NO_FORM = new Set(["havebuff", "nobuff", "equipped", "unequipped", "region", "skillmax", "invehicle", "outvehicle", "stickyif"]);
// Kinds that place their goal on the map themselves (the data's place or a goto).
const PLACED = new Set(["accept", "turnin", "talk", "vendor", "train", "buy"]);
// Kinds a Zygor step fights or farms for: the points of such a step are rounds Polestar finds itself.
const FARM = new Set(["kill", "collect", "interact"]);
// Kinds that name a quest's objective or turn-in: they need the quest in the log.
const QUEST_KINDS = new Set(["collect", "kill", "interact", "complete", "turnin"]);
const FORMAT5 = new Set(["task", "destroy", "money", "enter", "cast", "abandon", "skill"]);
const FORMAT5_WHEN = /^!?(dungeon|skill|money|cooldown|group|upgrade)\b/;
// The label as Polestar takes it (letters, digits, `-`, `_`).
const labelOf = (text) => String(text || "").trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || null;

// What the player reads: colour codes, emphasis and `Name##id` out; no double quotes (Polestar tokens).
export function clean(text) {
	return String(text || "")
		.replace(/##\d+\+?/g, "")
		.replace(/"/g, "'")
		.replace(/\{[a-z]?\}/gi, "")
		.replace(/\|c[0-9a-f]{8}|\|r/gi, "")
		.replace(/(^|[\s"(])_+/g, "$1").replace(/_+(?=[\s.,!?")]|$)/g, "")
		.replace(/\s+/g, " ").trim();
}

// Races named in a header condition (`raceclass('Scourge')`, `return Undead end`).
export function racesIn(text) {
	const s = String(text || "").replace(/Night Elf/gi, "NightElf");
	const out = [];
	for (const w of s.match(/[A-Za-z]+/g) || []) {
		const c = canon(w);
		if (c && RACES.includes(c) && !out.includes(c)) out.push(c);
	}
	return out;
}

const unquote = (s) => String(s || "").trim().replace(/^"(.*)"$/, "$1");
const both = (a, b) => ({ only: andOnly(a.only, b.only), whens: [...a.whens, ...b.whens], never: a.never || b.never });
const isModsOnly = (l) => l.verb === null && l.text === "";
const pt = (p) => ({ x: p.x, y: p.y, live: true });

// Zygor's `|goto Zone/0 x,y` or `Zone x,y` -> {uiMap, x, y}, or null when the zone is unknown.
export function parseGotoMod(args, data) {
	const m = /^(.+?)(?:\/\d+)?\s+(-?[\d.]+),\s*(-?[\d.]+)/.exec(String(args || "").trim());
	if (!m) return null;
	const uiMap = zoneIdNamed(data, m[1].trim());
	return uiMap == null ? null : { uiMap, x: Number(m[2]), y: Number(m[3]) };
}

function gapOf(ctx, zs, line, what, done) {
	ctx.gaps.push({ step: zs.no, line: String(line || "").slice(0, 140), what, done });
}

// A `|only` mod's condition. An expression it cannot read holds as nothing is known.
function condOf(args, ctx, zs, line) {
	let c;
	try { c = translate(args, {}); } catch {
		ctx.report.count("condition unreadable (not applied)");
		gapOf(ctx, zs, line, `condition "${args}" unreadable; not applied`, true);
		return { only: {}, whens: [], never: false };
	}
	for (const r of c.dropped) {
		ctx.report.count(`condition without a Polestar form: ${r} (kept without it)`);
		gapOf(ctx, zs, line, `condition "${r}" has no Polestar form; kept without it`, true);
	}
	return c;
}

// A quest goal: the giver is where the data places it, else the goto, else the codex.
function questGoal(kind, ref, place, ctx) {
	const { data, faction, report } = ctx;
	const known = data.quests[ref.id];
	if (known && !questOpenTo(data, known, faction, ctx.races.length ? ctx.races : null)) {
		report.count(`${kind} of a quest the data closes to these races (dropped)`);
		return null;
	}
	if (!known) return { kind, quest: ref.id, title: ref.name, ...(place ? { at: pt(place), _map: place.uiMap } : {}) };
	const ends = kind === "accept" ? known.start : known.end;
	if (questEndPlaced(data, ends)) return { kind, quest: ref.id };
	if (place) return { kind, quest: ref.id, at: pt(place), _map: place.uiMap };
	const listed = journalPlace(data, ref.id, kind === "accept" ? "start" : "finish");
	if (listed) return { kind, quest: ref.id, at: { x: listed.x, y: listed.y, live: listed.live }, _map: listed.map };
	// A giver inside a place the data has no map for (the Deeprun Tram): the arrow leads to the route's last point.
	if (ctx.lastPlace) { report.count(`${kind}: giver without a place (the route's last point)`); return { kind, quest: ref.id, at: pt(ctx.lastPlace), _map: ctx.lastPlace.uiMap }; }
	report.count(`${kind}: giver without a place (no @)`);
	return { kind, quest: ref.id };
}

// The goal of a verb line, or none (the text then shows). -> {goals, shown}
function verbGoals(l, ctx, place) {
	const { data, report } = ctx;
	const ids = refs(l.text);
	const first = ids[0];
	const lead = Number((l.text.match(/^(\d+)\s/) || [])[1]) || 1;
	const q = /^(\d+)/.exec((l.mods.find((m) => m.name === "q") || {}).args || "");
	const quest = q ? data.quests[Number(q[1])] : null;
	const questId = q ? Number(q[1]) : null;
	const none = { goals: [], shown: true };
	const got = (goal) => ({ goals: [goal], shown: false });
	switch (l.verb) {
		case "accept": case "turnin": {
			if (!first) return none;
			const g = questGoal(l.verb, first, place, ctx);
			return g ? got(g) : { goals: [], shown: false };
		}
		case "talk": {
			if (first && data.npcs[first.id]) return got({ kind: "talk", npc: first.id });
			return none;
		}
		case "kill": {
			// Without a quest, a kill is a farming line: the text shows, Polestar finds the spots.
			if (!first || !quest || !(quest.objectives || []).length) return none;
			const npcIds = ids.map((r) => r.id);
			const objs = quest.objectives;
			let hit = objs.findIndex((o) => o.type === "kill" && npcIds.includes(o.id));
			hit = hit >= 0 ? { obj: objs[hit], index: hit + 1 } : resolveObjective(quest, first.name, null);
			if (!hit) {
				report.note(ctx.name, ctx.curNo, `kill of quest ${questId} not matched by name; whole quest used`, l.text);
				return got({ kind: "complete", quest: questId });
			}
			const o = hit.obj;
			if (o.type === "item") return got({ kind: "collect", item: o.id, quest: questId, oi: hit.index });
			if (o.type === "object") return got({ kind: "interact", object: o.id, quest: questId, oi: hit.index });
			return got({ kind: "kill", npc: o.id, quest: questId, oi: hit.index });
		}
		case "collect": case "buy": case "expcollect": {
			if (!first || !data.items[first.id]) return none;
			const count = l.verb === "expcollect" ? Number((l.text.match(/##\d+,(\d+)/) || [])[1]) || 1 : lead;
			// `|q Q |future`: the quest is not taken yet (a bank pickup before the accept), a bag count.
			const future = l.mods.some((m) => m.name === "future");
			if (quest && !future && (quest.objectives || []).length) {
				const hit = resolveObjective(quest, "", first.id);
				if (hit && hit.obj.type === "item" && hit.obj.id === first.id) return got({ kind: "collect", item: first.id, quest: questId, oi: hit.index });
			}
			if (l.verb === "buy") return got({ kind: "buy", item: first.id, count });
			// A bag count at a place of its own (the bank, a chest) is there, not where the item drops.
			// Farming points are rounds Polestar finds itself; a pickup ahead of the quest (the bank) is at its point.
			const pickup = place && (future || l.mods.some((m) => m.name === "usebank"));
			return got({ kind: "collect", item: first.id, count, ...(pickup ? { at: pt(place), _map: place.uiMap } : {}) });
		}
		case "trash": {
			if (!first || !data.items[first.id]) return none;
			return got({ kind: "destroy", item: first.id });
		}
		case "ding": {
			const m = /^(\d+)(?:,\s*(\d+))?/.exec(l.text.trim());
			if (!m) return none;
			return got({ kind: "level", level: Number(m[1]), ...(m[2] ? { xp: Number(m[2]) } : {}) });
		}
		case "fpath": {
			const name = flightNamed(data, clean(l.text), ctx.faction, null);
			return name ? got({ kind: "getfp", location: name }) : none;
		}
		case "home": {
			const inn = innNamed(data, clean(l.text), null);
			return inn ? got({ kind: "sethome", location: inn.location }) : none;
		}
		case "skill": {
			const m = /^(.+?),\s*(\d+)$/.exec(l.text.trim());
			const skill = m && SKILLS.find((s) => s.toLowerCase() === m[1].trim().toLowerCase());
			return skill ? got({ kind: "skill", skill, n: Number(m[2]) }) : none;
		}
		case "learnspell": {
			if (!first) return none;
			return got({ kind: "learn", spell: first.id, name: first.name });
		}
		// Path points, maps and the like: nothing to show, the goto below still counts as a way.
		case "path": case "map": return { goals: [], shown: false };
		default: return none;
	}
}

// A text line that counts a quest objective (`Capture #5# Rats |q 6661/1`): that
// objective's goal, matched by its name or as the quest's only one; else the text shows.
function objectiveGoals(l, text, ctx) {
	const m = /^(\d+)\/(\d+)/.exec((l.mods.find((x) => x.name === "q") || {}).args || "");
	const quest = m && ctx.data.quests[Number(m[1])];
	const objs = (quest && quest.objectives) || [];
	// By name first; else Zygor's number, which follows the game's quest log as Polestar's does.
	const n = m ? Number(m[2]) : 0;
	const hit = objs.length ? resolveObjective(quest, text.replace(/#\d+#\s*/g, ""), null) || (objs[n - 1] ? { obj: objs[n - 1], index: n } : null) : null;
	if (!hit) return { goals: [], shown: !!text };
	const questId = Number(m[1]), o = hit.obj;
	ctx.report.count("text line with a quest objective -> its goal");
	if (o.type === "item") return { goals: [{ kind: "collect", item: o.id, quest: questId, oi: hit.index }], shown: false };
	if (o.type === "object") return { goals: [{ kind: "interact", object: o.id, quest: questId, oi: hit.index }], shown: false };
	if (o.type === "kill") return { goals: [{ kind: "kill", npc: o.id, quest: questId, oi: hit.index }], shown: false };
	// An event (escort, explore): Polestar counts it with the whole quest.
	return { goals: [{ kind: "complete", quest: questId }], shown: false };
}

// One Zygor line -> its goals, display text and tips. Mods first, then the verb.
function lineOf(l, ctx, zs) {
	const mod = (n) => l.mods.find((m) => m.name === n);
	const res = { goals: [], texts: [], kills: [], notes: [], tips: [], goto: null, nexts: [] };
	// The line's own condition: `|only` mods on this line only.
	let lc = { only: {}, whens: [], never: false };
	for (const m of l.mods) if (m.name === "only") lc = both(lc, condOf(m.args, ctx, zs, l.raw));
	if (lc.never) { ctx.report.count("line: impossible condition (dropped)"); return res; }
	const g = mod("goto");
	res.goto = g ? parseGotoMod(g.args, ctx.data) : null;
	const cf = mod("confirm");
	// A dungeon choice (`|confirm <Name>flag`) is Polestar's Options, not the step.
	if (cf && /flag$/i.test(cf.args)) { ctx.report.count("dungeon choice (confirm flag): dropped, Polestar asks in Options"); return res; }
	// A kill line that makes no goal shows as a kill.
	let text = l.verb === "kill" ? clean(`Kill ${l.text}`) : clean(l.text);
	// Zygor's "_NOTE:_" is a heading over the line that says what the note is.
	if (/^NOTE:?$/i.test(text)) text = "";
	const only = onlyText(lc.only);
	// A line for other races than the guide's is not for this player at all.
	if (lc.only.race && ctx.races.length && !lc.only.race.some((r) => ctx.races.includes(r))) { ctx.report.count("line for other races (dropped)"); return res; }

	const verb = l.verb ? verbGoals(l, ctx, res.goto) : objectiveGoals(l, text, ctx);
	const goals = verb.goals;
	res.goals.push(...goals.map((x) => ({ ...x, only })));
	if (verb.shown && text && l.verb !== "path" && l.verb !== "map") {
		// Text for some classes only is a note there (a step of its own holds nothing for it).
		if (only) res.notes.push({ text, only }); else res.texts.push(text);
		// "Kill X" beside a collect or kill: Polestar names the source itself (see finish).
		if (l.verb === "kill" && !goals.length) res.kills.push(text);
	}
	// `|confirm` holds the player at the line: a task with the line's text and goto.
	if (cf && !/flag$/i.test(cf.args) && text) {
		res.texts = res.texts.filter((t) => t !== text);
		// "Click Here to Continue" says nothing: the step's own text names the task (see finish).
		res.goals.push({ kind: "task", text, only, _generic: /^click( here)? to continue$/i.test(text) || undefined, ...(res.goto ? { at: pt(res.goto), _map: res.goto.uiMap } : {}) });
	}
	const cm = mod("complete");
	if (cm) {
		const goal = completeGoal(cm.args);
		if (goal && !res.goals.length) res.goals.push({ ...goal, only });
		else if (!res.goals.length && text) {
			res.texts = res.texts.filter((t) => t !== text);
			res.goals.push({ kind: "task", text, only, ...(res.goto ? { at: pt(res.goto), _map: res.goto.uiMap } : {}) });
		} else if (!goal) ctx.report.count("|complete check without a form (goal kept without it)");
	}
	const vm = mod("vendor");
	if (vm) {
		const npc = refs(vm.args)[0];
		if (npc && ctx.data.npcs[npc.id]) res.goals.push({ kind: "vendor", npc: npc.id, only });
		else {
			// The vendor is not in the data: Polestar finds the nearest one.
			ctx.report.count("|vendor: npc unknown to the data (nearest used)");
			res.goals.push({ kind: "vendor", only });
		}
	}
	const tm = mod("trainer");
	if (tm) {
		const npc = refs(tm.args)[0];
		if (npc && ctx.data.npcs[npc.id]) res.goals.push({ kind: "train", npc: npc.id, only });
		else ctx.report.count("|trainer: npc unknown to the data (line shows as text)");
	}
	const ls = mod("learnspell");
	if (ls && !/Pet Ability/i.test(l.text)) {
		const sp = refs(ls.args)[0];
		if (sp) res.goals.push({ kind: "learn", spell: sp.id, name: sp.name, only });
	}
	const dm = mod("ding");
	if (dm && /^\d+$/.test(dm.args.trim())) res.goals.push({ kind: "level", level: Number(dm.args), only });
	// "Train Abilities |trainer", "Sell Items |vendor": the goal says it already.
	if (res.goals.some((x) => ["vendor", "train", "learn", "level"].includes(x.kind))) {
		res.texts = res.texts.filter((t) => t !== text);
		res.notes = res.notes.filter((n) => n.text !== text);
	}
	for (const t of l.mods.filter((m) => m.name === "tip")) { const s = clean(t.args); if (s) res.tips.push(s); }
	for (const m of l.mods) {
		if (m.name === "next") res.nexts.push({ label: unquote(m.args), only: lc.only, whens: lc.whens, line: l.raw });
		if (NO_FORM.has(m.name)) { ctx.report.count(`|${m.name}: no Polestar form (line kept)`); gapOf(ctx, zs, l.raw, `|${m.name} ${m.args} has no Polestar form; kept without it`, true); }
	}
	// A predicate on a goal line: the step takes it when all its goals share it (see convertStep).
	if (lc.whens.length) for (const x of res.goals) x._whens = lc.whens;
	if (lc.whens.length && !res.goals.length) { ctx.report.count("line condition with a predicate on a text line (kept without it)"); gapOf(ctx, zs, l.raw, `${lc.whens.join(", ")} on a text line has no place to hold; kept without it`, true); }
	if (l.mods.some((m) => m.name === "notinsticky")) for (const x of res.goals) x._notSticky = true;
	if (l.mods.some((m) => m.name === "or")) for (const x of res.goals) x._or = true;
	// Every goal of a line with a goto sits on its map; a farming goal the data places nowhere takes the goto as its @.
	if (res.goto) for (const x of res.goals) {
		if (x._map == null) x._map = res.goto.uiMap;
		if (!x.at && ["kill", "collect", "interact"].includes(x.kind) && !goalPlaced(ctx.data, x)) x.at = pt(res.goto);
	}
	// The last point of a line that makes no goal is the way into the step.
	if (!res.goals.length && res.goto) res.way = res.goto;
	return res;
}

// Steps for one Zygor step: goals, tips, the way, jumps, and the step-level conditions.
function convertStep(zs, zi, ctx) {
	const { report } = ctx;
	let sc = { only: {}, whens: [], never: false };
	for (const l of zs.lines) {
		if (!isModsOnly(l)) continue;
		for (const m of l.mods) if (m.name === "only") sc = both(sc, condOf(m.args, ctx, zs, l.raw));
	}
	if (sc.never) { report.count("step: impossible condition (dropped)"); return null; }
	if (ctx.races.length && sc.only.race && !sc.only.race.some((r) => ctx.races.includes(r))) {
		report.count("step: for races the guide is not for (dropped)");
		return null;
	}
	ctx.curNo = zs.no;
	const st = { zi, no: zs.no, label: zs.label, starts: zs.starts, stops: zs.stops, goals: [], texts: [], kills: [], notes: [], tips: [], nexts: [], way: null, only: sc.only, whens: sc.whens };
	for (const l of zs.lines) {
		if (isModsOnly(l)) {
			// Step-level mods: a jump, a way point, a check; the `only` above.
			const jumps = l.mods.filter((m) => m.name === "next");
			for (const m of jumps) st.nexts.push({ label: unquote(m.args), only: {}, whens: [], line: l.raw });
			const g = l.mods.find((m) => m.name === "goto");
			if (g) { st.way = parseGotoMod(g.args, ctx.data) || st.way; if (st.way && ctx.firstMap == null) ctx.firstMap = st.way.uiMap; if (st.way) ctx.lastPlace = st.way; }
			for (const t of l.mods.filter((m) => m.name === "tip")) { const s = clean(t.args); if (s) st.tips.push(s); }
			const cm = l.mods.find((m) => m.name === "complete");
			if (cm) { const goal = completeGoal(cm.args); if (goal) st.goals.push({ ...goal, only: onlyText(sc.only), ...(l.mods.some((m) => m.name === "or") ? { _or: true } : {}) }); }
			continue;
		}
		const r = lineOf(l, ctx, zs);
		if (r.goto && ctx.firstMap == null) ctx.firstMap = r.goto.uiMap;
		if (r.goto) ctx.lastPlace = r.goto;
		st.goals.push(...r.goals.map((x) => ({ ...x, only: x.only || "" })));
		st.texts.push(...r.texts);
		st.kills.push(...r.kills);
		st.notes.push(...r.notes);
		st.tips.push(...r.tips);
		st.nexts.push(...r.nexts);
		if (r.way) st.way = r.way;
	}
	// The predicate of a goal line holds the step when all its goals share it; else each goal keeps none, gapped.
	const keys = new Set(st.goals.map((g) => (g._whens || []).join("\n")));
	if (st.goals.length && keys.size === 1 && st.goals[0]._whens) st.whens.push(...st.goals[0]._whens);
	else for (const g of st.goals) if (g._whens) {
		// A task would hold the step for everyone; as a tip it shows and holds nothing.
		if (g.kind === "task") { st.tips.push(g.text); g.kind = "drop"; report.count("task with a predicate beside other goals (shown as a tip)"); continue; }
		report.count("goal line predicate in a step of other goals (kept without it)");
		gapOf(ctx, zs, g.kind, `${g._whens.join(", ")} on a ${g.kind} beside other goals has no place to hold; kept without it`, true);
	}
	st.goals = st.goals.filter((g) => g.kind !== "drop");
	return st;
}

// The steps' goals after the rules that look across the step: talk to a giver or
// vendor the step names anyway is dropped; text alone holds as a task.
function finish(st, ctx) {
	let goals = st.goals;
	if (goals.some((g) => ["accept", "turnin", "vendor", "train"].includes(g.kind))) {
		const before = goals.length;
		goals = goals.filter((g) => g.kind !== "talk");
		if (goals.length !== before) ctx.report.count("talk to a giver or vendor the step already names (dropped)");
	}
	// A heading ("Inside Deeprun Tram:") shows above the step; it names no task.
	const tips = [...st.tips, ...st.texts.filter((t) => /:$/.test(t))];
	st.texts = st.texts.filter((t) => !/:$/.test(t));
	// Zygor's `|or`: one of the goals ends the step. Kills on the way there do not hold it.
	if (goals.some((g) => g._or && FARM.has(g.kind)) && goals.some((g) => g._or && !FARM.has(g.kind))) {
		for (const g of goals) if (g._or && FARM.has(g.kind)) g.optional = true;
		ctx.report.count("|or: farming beside a way (optional)");
	}
	const farms = goals.some((g) => g.kind === "collect" || g.kind === "kill");
	const texts = [...new Set(st.texts)].filter((t) => !(farms && (st.kills || []).includes(t)));
	for (const g of goals) if (g._generic && texts.length) g.text = texts.shift();
	if (!goals.length) {
		if (texts.length) goals.push({ kind: "task", text: texts.shift(), only: "" });
		else if (tips.length) goals.push({ kind: "task", text: tips.shift(), only: "" });
	}
	for (const t of texts) if (!tips.includes(t)) tips.push(t);
	// Class-only text: a note beside the step's goals; alone, it is a task for those players.
	for (const n of st.notes) {
		if (goals.length) goals.push({ kind: "note", text: n.text, only: n.only });
		else goals.push({ kind: "task", text: n.text, only: n.only });
	}
	st.goals = goals;
	st.tips = tips.filter((t, i) => tips.indexOf(t) === i);
	return st;
}

// A way point (the last goto of the lines that make no goal) is kept in front of
// its step's goals, unless a goal places itself or the step fights and farms.
function waySpot(goals, way) {
	if (!way || goals.some((g) => PLACED.has(g.kind) || FARM.has(g.kind))) return null;
	return way;
}

// Lowest pack format the step's goals and conditions need (docs/GUIDE_FORMAT.md).
function formatOf(s) {
	const f5 = s.goals.some((g) => FORMAT5.has(g.kind)) || s.skipto.length > 0 || s.whens.some((w) => FORMAT5_WHEN.test(w));
	return f5 ? 5 : 4;
}

function levelsOf(ids, data) {
	let lo = 0, hi = 0;
	for (const id of ids) {
		const q = data.quests[id];
		if (!q || !(q.level > 0)) continue;
		lo = Math.max(lo, q.minLevel > 0 ? q.minLevel : q.level);
		hi = Math.max(hi, q.level);
	}
	return hi ? `${lo}-${Math.max(lo, hi)}` : null;
}

// Zygor's name: `Leveling Guides\Invented Starter (1-13)` -> title, levels, class quests.
function namePart(name) {
	const last = String(name || "").split("\\").pop();
	const lv = /\((\d+)-(\d+)\)\s*$/.exec(last);
	return { title: last.replace(/\s*\(\d+-\d+\)\s*$/, "").trim(), levels: lv ? `${lv[1]}-${lv[2]}` : null };
}

// Converts one Zygor guide: {name, header, steps} (steps from parseBody).
// -> {text, format, levels, stepsIn, stepsOut, accepted, gaps}
export function convertGuide(guide, data, opts) {
	const { report, slug, packId } = opts;
	const header = guide.header || {};
	const faction = opts.faction || null;
	const races = [...new Set([...racesIn(header.condition_suggested), ...racesIn(header.condition_visible)])];
	const ctx = { report, data, name: guide.name, faction, races, gaps: [], pendingWay: null };
	const { title, levels: nameLevels } = namePart(guide.name);
	const cls = /^(.+?) Class Quests$/.exec(title);
	const klass = cls && CLASSES.includes(canon(cls[1]) || "") ? canon(cls[1]) : null;

	// Steps, then the jumps, sticky copies and labels that link them.
	const irSteps = [];
	let carry = { label: null, starts: [], stops: [] };
	for (const [zi, zs] of guide.steps.entries()) {
		const st = convertStep(zs, zi, ctx);
		if (!st) {
			if (zs.label) carry.label = zs.label;
			carry.starts.push(...zs.starts);
			carry.stops.push(...zs.stops);
			continue;
		}
		finish(st, ctx);
		if (carry.label && !st.label) st.label = carry.label;
		st.starts = [...carry.starts, ...st.starts];
		st.stops = [...carry.stops, ...st.stops];
		carry = { label: null, starts: [], stops: [] };
		// A step with no goal passes its way on to the next step (as RXP's way).
		if (!st.goals.length) { ctx.pendingWay = st.way || ctx.pendingWay; continue; }
		const way = waySpot(st.goals, st.way || ctx.pendingWay);
		ctx.pendingWay = null;
		irSteps.push({ ...st, wayKeep: way, rawLabel: st.label });
	}
	// Carry-over labels of dropped steps ended up on the next step; a trailing one has no step.
	if (carry.label) report.count("label of a last step that is dropped (no step to name)");

	// Jumps: forward only; a backward or missing target is gapped.
	const indexOfLabel = (name, from) => irSteps.findIndex((t, j) => j > from && t.rawLabel === name);
	irSteps.forEach((s, p) => {
		s.skipto = [];
		for (const n of s.nexts) {
			if (Object.keys(n.only).length) { report.count("|next on a class line: no Polestar form (jump dropped)"); gapOf(ctx, { no: s.no }, n.line, "jump for a class: no Polestar form, jump dropped", false); continue; }
			const j = indexOfLabel(n.label, p);
			if (j < 0) {
				report.count("|next backward or to no label (dropped)");
				gapOf(ctx, { no: s.no }, n.line, `jump to "${n.label}" is backward or has no label; dropped`, false);
				continue;
			}
			if (j === p + 1) { report.count("|next to the next step (no jump)"); continue; }
			if (n.whens.length > 1) { report.count("|next on several predicates (dropped)"); gapOf(ctx, { no: s.no }, n.line, "jump on several predicates (and): no Polestar form, dropped", false); continue; }
			const when = n.whens.length ? n.whens[0] : "level>=1";
			s.skipto.push({ target: irSteps[j], when });
			report.count("|next forward -> skipto");
		}
	});

	// Sticky: a copy of the bound label's countable goals, along until the label (or the stop).
	const copies = [];
	irSteps.forEach((s, p) => {
		for (const name of s.starts) {
			const j = indexOfLabel(name, p);
			if (j < 0) {
				report.count("sticky start with no label after it (dropped)");
				gapOf(ctx, { no: s.no }, `stickystart "${name}"`, "no label of that name after the start; dropped", false);
				continue;
			}
			const L = irSteps[j];
			const goals = L.goals.filter((g) => !g._notSticky && (g.kind === "collect" || ((g.kind === "kill" || g.kind === "interact") && g.quest != null)))
				.map((g) => ({ ...g }));
			if (!goals.length) { report.count("sticky: nothing countable to copy"); continue; }
			let k = -1;
			for (let q = p + 1; q <= j; q++) if (irSteps[q].stops.includes(name)) { k = q; break; }
			const target = k >= 0 ? irSteps[k] : L;
			if (k >= 0) target.rawLabel = target.rawLabel || `${name}-stop`;
			copies.push({ before: s, step: { stepNo: L.stepNo || L.no, title: null, only: L.only, whens: L.whens, goals, tips: [], notes: [], maps: [], loop: [], allAlong: true, skipto: [], format: formatOf({ goals, skipto: [], whens: L.whens }), sticky: false, completesWith: null, label: null, alongTarget: target } });
			report.count(k >= 0 ? "sticky: along until a stop" : "sticky: along until the label");
		}
	});

	// Labels: unique per guide, the ones some step names.
	const taken = new Set();
	const fresh = (base) => { let n = 1, c = base; while (taken.has(c)) c = `${base}-${++n}`; taken.add(c); return c; };
	for (const s of irSteps) if (s.rawLabel) s.label = fresh(labelOf(s.rawLabel) || "step");
	for (const c of copies) c.step.alongUntil = c.step.alongTarget.label;
	for (const s of irSteps) for (const k of s.skipto) k.label = k.target.label;
	const withCopies = [];
	for (const s of irSteps) {
		for (const c of copies) if (c.before === s) withCopies.push(c.step);
		withCopies.push(s);
	}

	// The step's own form: its zone is the first map its goals or way sit on.
	const steps = [];
	// Quests taken before this guide (its chain) count as accepted; a goal of a quest not
	// accepted earlier in the guide waits in a step `when onquest <quest>`.
	const seenQ = new Set(opts.before || []);
	const splitOrphans = (out, copy) => {
		const main = [];
		const orphan = new Map();
		for (const g of out.goals) {
			if (g.kind === "accept") seenQ.add(g.quest);
			if (QUEST_KINDS.has(g.kind) && g.quest != null && !seenQ.has(g.quest)) {
				if (!orphan.has(g.quest)) orphan.set(g.quest, []);
				orphan.get(g.quest).push(g);
			} else main.push(g);
		}
		if (!orphan.size) return [out];
		if (copy) { report.count("sticky copy: goals of quests not accepted before it (left out)"); return main.length ? [{ ...out, goals: main }] : []; }
		report.count("goals of quests not accepted earlier -> when onquest");
		const pre = [...orphan].map(([q, gs]) => ({ ...out, goals: gs, tips: [], notes: [], maps: [], whens: [...out.whens, `onquest ${q}`], label: null, skipto: [], alongUntil: null, format: formatOf({ goals: gs, skipto: [], whens: [`onquest ${q}`] }) }));
		if (!main.length) { if (out.label) pre[pre.length - 1].label = out.label; return pre; }
		return [...pre, { ...out, goals: main }];
	};
	for (const s of withCopies) {
		const maps = [];
		const way = s.wayKeep;
		if (way) maps.push(way.uiMap);
		for (const g of s.goals) if (g._map != null) maps.push(g._map);
		const wayGoal = way ? [{ kind: "goto", x: way.x, y: way.y, live: true, map: way.uiMap, optional: true, only: "" }] : [];
		const goals = [...wayGoal, ...s.goals].map((g) => { const { _map, _notSticky, _whens, ...rest } = g; return rest; });
		if (!goals.length) continue;
		const out = { stepNo: s.stepNo || s.no, title: null, only: s.only, whens: s.whens, goals, tips: s.tips || [], notes: [], maps: [...new Set(maps)], loop: [], allAlong: !!s.alongTarget, label: s.label || null, alongUntil: s.alongUntil || null, skipto: (s.skipto || []).map((k) => ({ label: k.label, when: k.when })), format: formatOf({ goals, skipto: s.skipto || [], whens: s.whens }) };
		steps.push(...splitOrphans(out, !!s.alongTarget));
	}
	const accepted = new Set(steps.flatMap((s) => s.goals.filter((g) => g.kind === "accept").map((g) => g.quest)));
	// The zone: the first goto of the guide, else the first step's map, else the guide's own zone or its capital.
	const capital = zoneIdNamed(data, faction === "Alliance" ? "Stormwind City" : "Orgrimmar");
	const defaultMap = ctx.firstMap ?? (steps.find((s) => s.maps.length) || {}).maps?.[0] ?? zoneIdNamed(data, title) ?? capital;
	const zone = defaultMap != null ? zoneName(data, defaultMap) : null;
	const guideOut = {
		name: guide.name,
		title,
		faction,
		classes: klass ? [klass] : null,
		races,
		levels: nameLevels || levelsOf([...accepted].filter((id) => !(opts.before || new Set()).has(id)), data),
		zone,
		defaultMap,
		category: klass ? "Class" : "Leveling",
		sourceSteps: guide.steps.length,
		steps,
	};
	if (!guideOut.zone) report.note(guide.name, 0, "no zone for the guide; check the header", "");
	const r = render(guideOut, { report, slug, packId, next: opts.next || [] });
	const gaps = ctx.gaps;
	return { text: r.text, format: r.format, levels: r.levels, stepsIn: guide.steps.length, stepsOut: r.stepsOut, accepted, gaps };
}
