// Zygor guide (src/zygor/parse.mjs) -> the intermediate form (src/ir.mjs), then
// rendered by src/emit.mjs. The player sees what Zygor shows: a step's goals
// hold until done, ticked or skipped. A line Zygor only displays becomes a tip,
// or a task when its step has no goal. Nothing is guessed: an id the data does
// not know is quoted by name or the line becomes text, and the report says so.

import { translate, completeGoal, crossAlts, tidy, negWhen } from "./cond.mjs";
import { refs } from "./parse.mjs";
import { onlyText, andOnly, canon, RACES, CLASSES } from "../cond.mjs";
import { zoneIdNamed, zoneName, questEndPlaced, questOpenTo, journalPlace, innNamed, flightNamed, goalPlaced, soldTo, factionNamed } from "../data.mjs";
import { resolveObjective } from "../objective.mjs";
import { render } from "../emit.mjs";

const SKILLS = ["Alchemy", "Blacksmithing", "Cooking", "Enchanting", "Engineering", "Fishing", "First Aid", "Herbalism", "Leatherworking", "Mining", "Skinning", "Tailoring"];
// Mods whose condition Polestar has no form for: the line is kept, the condition gapped.
const PROFESSIONS = new Set(["Alchemy", "Blacksmithing", "Enchanting", "Engineering", "Herbalism", "Leatherworking", "Mining", "Skinning", "Tailoring", "Cooking", "First Aid", "Fishing"]);
const NO_FORM = new Set(["havebuff", "nobuff", "equipped", "unequipped", "region", "skillmax", "invehicle", "outvehicle", "stickyif"]);
// Zygor's `|skillmax P,N`: the rank whose cap N is.
const RANKS = { 75: "Apprentice", 150: "Journeyman", 225: "Expert", 300: "Artisan" };
// Kinds that place their goal on the map themselves (the data's place or a goto).
const PLACED = new Set(["accept", "turnin", "talk", "vendor", "train", "buy"]);
// Kinds a Zygor step fights or farms for: the points of such a step are rounds Polestar finds itself.
const FARM = new Set(["kill", "collect", "interact"]);
// Kinds that name a quest's objective or turn-in: they need the quest in the log.
const QUEST_KINDS = new Set(["collect", "kill", "interact", "complete", "turnin"]);
// Conditions read as something Polestar has (src/zygor/cond.mjs), as the report counts them.
const READ = {
	walking: "condition walking: holds off a flight (Classic has no flying mount)",
	indoors: "condition indoors beside its subzone: read as the subzone",
	discountgold: "condition discountgold: money>= the full price",
	season: "condition Season of Discovery or Mastery: false in Classic Era",
	nearest: "condition dist/default (the nearest trainer): Polestar picks the nearest",
};
const FORMAT5 = new Set(["task", "destroy", "money", "enter", "cast", "abandon", "skill"]);
const FORMAT5_WHEN = /^!?(dungeon|skill|money|cooldown|group|upgrade)\b/;
// The label as Polestar takes it (letters, digits, `-`, `_`).
const labelOf = (text) => String(text || "").trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || null;

// What the player reads: colour codes, emphasis and `Name##id` out; no double quotes (Polestar tokens).
export function clean(text) {
	return String(text || "")
		.replace(/##\d+\+?/g, "")
		.replace(/##[A-Za-z][^\s|]*/g, "") // a name in place of the id: "Exampler##Exampler"
		.replace(/([A-Za-z])\+(?=[\s.,]|$)/g, "$1") // Zygor's "several of these": "Example Item+" (not "level 50+")
		.replace(/<([^<>]+)>/g, "$1") // emphasis: "<Create 5 Example Items>"
		.replace(/\[([^\]\/]+)\/\d+ ([\d.]+),([\d.]+)\]/g, "$1 $2,$3") // a map link: "[Invented Vale/0 50.00,50.00]"
		.replace(/\[([\d.]+),([\d.]+)\]/g, "$1,$2") // one on the step's map: "[45.55,38.57]"
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
const NONE = () => ({ only: {}, whens: [], alts: [], never: false });
const both = (a, b) => ({ only: andOnly(a.only, b.only), whens: [...a.whens, ...b.whens], alts: crossAlts(a.alts, b.alts), never: a.never || b.never });
const isModsOnly = (l) => l.verb === null && l.text === "";
const isStepOnly = (l) => isModsOnly(l) && l.mods[0]?.name === "only";
const pt = (p) => ({ x: p.x, y: p.y, live: true });

// Zygor's `|goto Zone/0 x,y` or `Zone x,y` -> {uiMap, x, y}, or null when the zone is unknown.
// A bare `x,y` is on the map of the point before it (`map`), as in Zygor.
export function parseGotoMod(args, data, map = null) {
	const bare = /^(-?[\d.]+),\s*(-?[\d.]+)/.exec(String(args || "").trim());
	// A point a little past the map's edge (100.22) is on the edge: Polestar takes 0-100.
	const pc = (v) => Math.min(100, Math.max(0, Number(v)));
	if (bare) return map == null ? null : { uiMap: map, x: pc(bare[1]), y: pc(bare[2]) };
	const m = /^(.+?)(?:\/\d+)?\s+(-?[\d.]+),\s*(-?[\d.]+)/.exec(String(args || "").trim());
	if (!m) return null;
	const uiMap = zoneIdNamed(data, m[1].trim());
	return uiMap == null ? null : { uiMap, x: pc(m[2]), y: pc(m[3]) };
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
		return NONE();
	}
	for (const r of c.read) ctx.report.count(READ[r]);
	if (c.alts.length) ctx.report.count("condition with an OR -> a copy of the step per alternative");
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
	// The route's last point: this step's, a way step's just before it, else the last one walked
	// (Polestar needs a point for the arrow; the data places such a giver nowhere).
	const near = ctx.stepPlace || ctx.pendingWay || ctx.wayBefore || ctx.lastPlace;
	if (near) { report.count(`${kind}: giver without a place (the route's last point)`); return { kind, quest: ref.id, at: pt(near), _map: near.uiMap }; }
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
		case "turninany": {
			// "Name##5093,5094,5095": whichever of them the player has; one not taken here holds only when in the log.
			const m = /##([\d,]+)/.exec(l.text);
			if (!m) return none;
			const gs = m[1].split(",").map(Number).map((id) => questGoal("turnin", { id, name: first && first.name }, place, ctx)).filter(Boolean);
			return { goals: gs, shown: false };
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
			// No vendor in the data (the auction house): bought where the line points, counted in the bags.
			const sold = soldTo(data, first.id, ctx.faction);
			if (l.verb === "buy" && sold) return got({ kind: "buy", item: first.id, count });
			if (l.verb === "buy") return got({ kind: "collect", item: first.id, count, ...(place ? { at: pt(place), _map: place.uiMap } : {}) });
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
		case "cast": {
			if (!first) return none;
			return got({ kind: "cast", spell: first.id, name: first.name });
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
	const qa = (l.mods.find((x) => x.name === "q") || {}).args || "";
	const m = /^(\d+)\/(\d+)/.exec(qa);
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
	const res = { goals: [], texts: [], kills: [], notes: [], tips: [], goto: null, nexts: [], pre: [], path: [] };
	// The line's own condition: `|only` mods on this line only.
	let lc = NONE();
	for (const m of l.mods) if (m.name === "only") lc = both(lc, condOf(m.args, ctx, zs, l.raw));
	if (lc.never) { ctx.report.count("line: impossible condition (dropped)"); return res; }
	// One of several trainers by distance (`|only if dist(...) < N`, `|only if default`): Polestar's
	// `train` and `learn` go to the nearest one, so the line's NPC and point are left to it.
	const nearest = l.mods.some((m) => m.name === "only" && /\bdist\s*\(|\bdefault\b/.test(m.args));
	if (nearest && (l.verb === "talk" || l.verb === "goto")) { ctx.report.count("trainer picked by distance: left to Polestar's nearest"); res.nearest = true; return res; }
	const g = mod("goto");
	res.goto = g ? parseGotoMod(g.args, ctx.data, ctx.lastPlace?.uiMap) : null;
	const cf = mod("confirm");
	// A dungeon choice (`|confirm <Name>flag`) is Polestar's Options, not the step.
	if (cf && /flag$/i.test(cf.args)) { ctx.report.count("dungeon choice (confirm flag): dropped, Polestar asks in Options"); return res; }
	// A kill line that makes no goal shows as a kill.
	const SAYS = { kill: "Kill", click: "Click", use: "Use", equip: "Equip" };
	let text = SAYS[l.verb] ? clean(`${SAYS[l.verb]} ${l.text}`) : clean(l.text);
	// Zygor's "_NOTE:_" is a heading over the line that says what the note is.
	if (/^NOTE:?$/i.test(text)) text = "";
	const only = onlyText(lc.only);
	// A line for other races than the guide's is not for this player at all.
	if (lc.only.race && ctx.races.length && !lc.only.race.some((r) => ctx.races.includes(r))) { ctx.report.count("line for other races (dropped)"); return res; }

	// A gathering route: `map <Zone>`, then `path x,y x,y ...` (its settings line has no point).
	if (l.verb === "map") { const z = zoneIdNamed(ctx.data, clean(l.text).replace(/\/\d+$/, "")); if (z != null) ctx.pathMap = z; }
	if (l.verb === "path") {
		const map = ctx.pathMap ?? ctx.lastPlace?.uiMap;
		for (const m of l.text.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)) if (map != null) res.path.push({ x: Number(m[1]), y: Number(m[2]), live: true, uiMap: map });
	}
	const verb = l.verb ? verbGoals(l, ctx, res.goto) : objectiveGoals(l, text, ctx);
	const goals = verb.goals;
	// `|n`: Zygor counts the goal but never ticks it (a farming guide's herbs); the step's
	// `|confirm` ends it.
	const counts = l.mods.some((m) => m.name === "n");
	res.goals.push(...goals.map((x) => ({ ...x, only, ...(counts ? { optional: true } : {}) })));
	if (verb.shown && text && l.verb !== "path" && l.verb !== "map") {
		// Text for some classes only is a note there (a step of its own holds nothing for it).
		if (only) res.notes.push({ text, only }); else res.texts.push(text);
		// "Kill X" beside a collect or kill: Polestar names the source itself (see finish).
		if (l.verb === "kill" && !goals.length) res.kills.push(text);
	}
	// `|confirm` holds the player at the line: a task with the line's text and goto.
	if (cf && !/flag$/i.test(cf.args) && text) {
		res.texts = res.texts.filter((t) => t !== text);
		res.notes = res.notes.filter((n) => n.text !== text);
		// "Click Here to Continue" says nothing: the step's own text names the task (see finish).
		// On a goal line ("collect Example Herb |n" / "'|confirm") the step's own text names it too.
		const jump = mod("next");
		// A `'|confirm` line of its own under a text line holds the step, not that line.
		const ownLine = /\n'[^\n]*\|confirm/.test(l.raw) && !/\|confirm/.test(l.raw.split("\n")[0]);
		res.goals.push({ kind: "task", text, only, _generic: /^click( here)? to continue$/i.test(text) || goals.length > 0 || ownLine || undefined, ...(jump ? { _next: unquote(jump.args) } : {}), ...(res.goto ? { at: pt(res.goto), _map: res.goto.uiMap } : {}) });
	}
	const cm = mod("complete");
	if (cm) {
		const goal = completeGoal(cm.args);
		const drop = /^\s*not\s+haveq\((\d+)\)\s*$/.exec(cm.args);
		// "Abandon Example Quest |complete not haveq(100)": Polestar's abandon checks the log itself.
		if (!res.goals.length && drop && /^abandon\b/i.test(text) && ctx.data.quests[Number(drop[1])]) {
			res.texts = res.texts.filter((t) => t !== text);
			res.goals.push({ kind: "abandon", quest: Number(drop[1]), only, _text: text });
		} else if (res.goals.length && !res.goals.some((x) => x.kind === "task")) {
			// `accept 100 |complete completedq(100)`: the goal counts as done once the check holds, so
			// it is for those the check does not hold for.
			let not = null;
			try { not = translate(`not (${cm.args})`, {}); } catch { not = null; }
			if (not && !not.dropped.length && !Object.keys(not.only).length && !not.never && (not.whens.length || not.alts.length)) {
				for (const x of res.goals) { x._whens = [...(x._whens || []), ...not.whens]; x._alts = crossAlts(x._alts || [], not.alts); }
				ctx.report.count("|complete check on a goal line -> the goal while it does not hold");
			}
		} else if (goal && !res.goals.length) res.goals.push({ ...goal, only, _cond: cm.args });
		else if (!res.goals.length && text) {
			res.texts = res.texts.filter((t) => t !== text);
			res.notes = res.notes.filter((n) => n.text !== text);
			res.goals.push({ kind: "task", text, only, ...(res.goto ? { at: pt(res.goto), _map: res.goto.uiMap } : {}) });
		} else if (!goal && !res.goals.length) ctx.report.count("|complete check without a form (goal kept without it)");
	}
	// "Train Journeyman Mining |skillmax Mining,150": the rank whose cap that is, which Polestar's `train` sees.
	const sm = mod("skillmax");
	const prof = sm && /^\s*([A-Za-z ]+?)\s*,\s*(\d+)\s*$/.exec(sm.args);
	if (prof && PROFESSIONS.has(prof[1]) && RANKS[prof[2]] && !res.goals.length) {
		res.texts = res.texts.filter((t) => t !== text);
		res.notes = res.notes.filter((n) => n.text !== text);
		res.goals.push({ kind: "train", profession: prof[1], rank: RANKS[prof[2]], only, _learned: true });
	}
	// "Reach Skill 75 in Herbalism |skill Herbalism,75": the skill goal.
	const sk = mod("skill");
	const skm = sk && /^\s*([A-Za-z ]+?)\s*,\s*(\d+)\s*$/.exec(sk.args);
	const skill = skm && SKILLS.find((x) => x.toLowerCase() === skm[1].toLowerCase());
	if (skill && !res.goals.length) {
		res.texts = res.texts.filter((t) => t !== text);
		res.notes = res.notes.filter((n) => n.text !== text);
		res.goals.push({ kind: "skill", skill, n: Number(skm[2]), only });
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
	// `|learnspell` (Zygor's leveling files) and `|learn` (its profession files): a spell or recipe to learn.
	const ls = mod("learnspell") || mod("learn");
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
		if (m.name === "next") res.nexts.push({ label: unquote(m.args), only: lc.only, whens: [], alts: [], line: l.raw, goal: res.goals[0] || null });
		if (NO_FORM.has(m.name) && !(m.name === "skillmax" && res.goals.some((x) => x._learned))) { ctx.report.count(`|${m.name}: no Polestar form (line kept)`); gapOf(ctx, zs, l.raw, `|${m.name} ${m.args} has no Polestar form; kept without it`, true); }
	}
	// A predicate on a goal line: the step takes it when all its goals share it (see convertStep).
	const held = lc.whens.length || lc.alts.length;
	if (held) for (const x of res.goals) { x._whens = [...(x._whens || []), ...lc.whens]; x._alts = crossAlts(x._alts || [], lc.alts); }
	// "Enter the Example Dungeon |goto Example Dungeon/0 0,0 |c": a map Polestar has no frame for
	// (the dungeon's own) is the place to be in.
	if (!res.goals.length && g && !res.goto && /^enter\b/i.test(text)) {
		const place = (/^(.+?)(?:\/\d+)?\s+-?[\d.]+,/.exec(g.args.trim()) || [])[1];
		if (place) {
			res.texts = res.texts.filter((t) => t !== text);
			res.goals.push({ kind: "enter", place, only });
			ctx.report.count("enter a dungeon (its own map) -> enter");
		}
	}
	// A way line for some places only ("Leave the cave |goto … |only if subzone(…)"): Zygor
	// shows it until the player is there, so it is a goto step of its own, before its step.
	if (held && !res.goals.length && res.goto && (l.verb === null || l.verb === "goto") && text && !mod("q")) {
		res.texts = res.texts.filter((t) => t !== text);
		res.notes = res.notes.filter((n) => n.text !== text);
		const w = res.goto;
		res.pre.push({ goal: { kind: "goto", x: w.x, y: w.y, live: true, map: w.uiMap, text, only: "", _map: w.uiMap }, only: lc.only, whens: lc.whens, alts: lc.alts });
		ctx.report.count("way line with a condition -> a goto step of its own");
		ctx.lastPlace = w;
		return res;
	}
	if (held && !res.goals.length) { ctx.report.count("line condition with a predicate on a text line (kept without it)"); gapOf(ctx, zs, l.raw, `${lc.whens.join(", ")} on a text line has no place to hold; kept without it`, true); }
	if (l.mods.some((m) => m.name === "notinsticky")) for (const x of res.goals) x._notSticky = true;
	if (l.mods.some((m) => m.name === "or")) for (const x of res.goals) x._or = true;
	// Every goal of a line with a goto sits on its map; a farming goal the data places nowhere takes the goto as its @.
	if (res.goto) for (const x of res.goals) {
		if (x._map == null) x._map = res.goto.uiMap;
		if (!x.at && ["kill", "collect", "interact"].includes(x.kind) && !goalPlaced(ctx.data, x)) x.at = pt(res.goto);
	}
	// The last point of a line that makes no goal is the way into the step.
	if (!res.goals.length && res.goto) { res.way = res.goto; if (res.texts.includes(text)) res.wayLine = { w: res.goto, text }; }
	// `use Example Item##100` with nothing else in its step is that item's use goal (see finish).
	if (l.verb === "use" && !res.goals.length) { const it = refs(l.text)[0]; if (it && ctx.data.items[it.id]) res.use = { item: it.id, text }; }
	return res;
}

// Steps for one Zygor step: goals, tips, the way, jumps, and the step-level conditions.
function convertStep(zs, zi, ctx) {
	const { report } = ctx;
	let sc = NONE();
	for (const l of zs.lines) {
		// Zygor's parser: an `|only` that opens its line is the step's; later on a line it is that line's.
		if (!isStepOnly(l)) continue;
		for (const m of l.mods) if (m.name === "only") sc = both(sc, condOf(m.args, ctx, zs, l.raw));
	}
	if (sc.never) { report.count("step: impossible condition (dropped)"); return null; }
	if (ctx.races.length && sc.only.race && !sc.only.race.some((r) => ctx.races.includes(r))) {
		report.count("step: for races the guide is not for (dropped)");
		return null;
	}
	ctx.curNo = zs.no;
	ctx.stepPlace = null;
	ctx.pathMap = null;
	const st = { nearest: false, wayLines: [], uses: [], zi, no: zs.no, label: zs.label, starts: zs.starts, stops: zs.stops, goals: [], texts: [], kills: [], notes: [], tips: [], nexts: [], pre: [], path: [], way: null, only: sc.only, whens: sc.whens, alts: sc.alts };
	for (const l of zs.lines) {
		if (isModsOnly(l)) {
			// A line of its own condition (`|tip … |only if hardcore`): left out when it cannot hold, a note when for some players.
			let lc = NONE();
			if (!isStepOnly(l)) for (const m of l.mods) if (m.name === "only") lc = both(lc, condOf(m.args, ctx, zs, l.raw));
			if (lc.never) { report.count("line: impossible condition (dropped)"); continue; }
			const lineOnly = onlyText(lc.only);
			// Step-level mods: a jump, a way point, a check; the `only` above.
			const jumps = l.mods.filter((m) => m.name === "next");
			// `'|complete skill("Example") >= 50 |next "Label"`: the jump once the check holds; a check
			// Polestar cannot ask blocks the jump (see the jumps in convertGuide).
			const check = l.mods.find((m) => m.name === "complete");
			const asked = check ? (() => { try { return translate(check.args, {}); } catch { return null; } })() : null;
			const blocked = !!check && (!asked || asked.dropped.length > 0 || Object.keys(asked.only).length > 0);
			for (const m of jumps) st.nexts.push({ label: unquote(m.args), only: {}, whens: asked && !blocked ? asked.whens : [], alts: asked && !blocked ? asked.alts : [], blocked, line: l.raw });
			// `'|confirm`: the step's "Click here" button, named by the step's text.
			if (l.mods.some((m) => m.name === "confirm") && !l.mods.some((m) => m.name === "confirm" && /flag$/i.test(m.args))) st.goals.push({ kind: "task", text: "Click Here to Continue", only: lineOnly, _generic: true, ...(jumps.length ? { _next: unquote(jumps[0].args) } : {}) });
			// `'|goto … |noway |c`: the end of a gathering route, done at once; no way to walk.
			const g = l.mods.some((m) => m.name === "noway") ? null : l.mods.find((m) => m.name === "goto");
			if (g) { st.way = parseGotoMod(g.args, ctx.data, ctx.lastPlace?.uiMap) || st.way; if (st.way && ctx.firstMap == null) ctx.firstMap = st.way.uiMap; if (st.way) ctx.lastPlace = ctx.stepPlace = st.way; }
			for (const t of l.mods.filter((m) => m.name === "tip")) { const s = clean(t.args); if (s && lineOnly) st.notes.push({ text: s, only: lineOnly }); else if (s) st.tips.push(s); }
			const cm = l.mods.find((m) => m.name === "complete");
			if (cm) { const goal = completeGoal(cm.args); if (goal) st.goals.push({ ...goal, only: lineOnly, _cond: cm.args, ...(jumps.length ? { _jump: true } : {}), ...(l.mods.some((m) => m.name === "or") ? { _or: true } : {}) }); }
			continue;
		}
		const r = lineOf(l, ctx, zs);
		if (r.goto && ctx.firstMap == null) ctx.firstMap = r.goto.uiMap;
		if (r.goto) ctx.lastPlace = ctx.stepPlace = r.goto;
		st.goals.push(...r.goals.map((x) => ({ ...x, only: x.only || "" })));
		st.texts.push(...r.texts);
		st.kills.push(...r.kills);
		st.notes.push(...r.notes);
		st.tips.push(...r.tips);
		st.nexts.push(...r.nexts);
		st.pre.push(...r.pre);
		st.path.push(...r.path);
		if (r.nearest) st.nearest = true;
		if (r.way) st.way = r.way;
		if (r.wayLine) st.wayLines.push(r.wayLine);
		if (r.use) st.uses.push(r.use);
	}
	// The predicate of a goal line holds the step when all its goals share it; else the step is
	// split after finish (see splitByCondition).
	for (const g of st.goals) if (g._whens) Object.assign(g, (({ whens, alts }) => ({ _whens: whens, _alts: alts }))(withoutUndone({ whens: g._whens, alts: g._alts }, [g])));
	Object.assign(st, withoutUndone(st, st.goals));
	const keys = new Set(st.goals.map(condKey));
	if (st.goals.length && keys.size === 1 && condKey(st.goals[0])) {
		st.whens = [...st.whens, ...st.goals[0]._whens];
		st.alts = crossAlts(st.alts, st.goals[0]._alts);
		for (const g of st.goals) { delete g._whens; delete g._alts; }
	}
	return st;
}

// `!has I xN` beside a goal to collect N of I says only that the goal is not done yet.
function saysUndone(pred, goals) {
	const m = /^!has (\d+)(?: x(\d+))?$/.exec(pred);
	return !!m && goals.some((g) => g.kind === "collect" && g.item === Number(m[1]) && (g.count || 1) <= Number(m[2] || 1));
}

// A condition without what the goals say anyway; an alternative left empty makes the OR always hold.
function withoutUndone(c, goals) {
	const whens = c.whens.filter((w) => !saysUndone(w, goals));
	const alts = c.alts.map((a) => a.filter((w) => !saysUndone(w, goals)));
	return { whens, alts: alts.some((a) => !a.length) ? [] : alts };
}

const condKey = (g) => (g._whens?.length || g._alts?.length ? JSON.stringify([g._whens, g._alts]) : "");

// A step whose goal lines hold under different conditions (`turnin A |only if readyq(A)`
// beside `accept B`): one step per run of lines alike, in the step's order, each with its
// condition. The first keeps the step's label, tips, way and jumps; class notes go with the last.
function splitByCondition(st, ctx) {
	const held = st.goals.filter((g) => g.kind !== "note");
	if (new Set(held.map(condKey)).size <= 1) return [st];
	const runs = [];
	for (const g of held) {
		const k = condKey(g);
		if (!runs.length || runs[runs.length - 1].k !== k) runs.push({ k, goals: [], whens: g._whens || [], alts: g._alts || [] });
		runs[runs.length - 1].goals.push(g);
	}
	runs[runs.length - 1].goals.push(...st.goals.filter((g) => g.kind === "note"));
	ctx.report.count("step with goal lines under different conditions -> one step per condition", runs.length - 1);
	return runs.map((r, i) => {
		for (const g of r.goals) { delete g._whens; delete g._alts; }
		const base = i === 0 ? st : { ...st, label: null, starts: [], stops: [], tips: [], nexts: [], pre: [], path: [], way: null };
		return { ...base, goals: r.goals, whens: [...st.whens, ...r.whens], alts: crossAlts(st.alts, r.alts), first: i === 0 };
	}).filter((p, i) => i === 0 || tidy(p.whens));
}

// A menu (`Option A |confirm |next "A"`, `Option B |confirm |next "B"`): Zygor jumps to the one
// the player clicks. One step per option, each a task to tick, the source's text over each;
// the player ticks the one they want and skips the others, and the step after a ticked one
// jumps to its label (see the jumps in convertGuide).
function splitChoices(st, ctx) {
	const choices = st.goals.filter((g) => g._next !== undefined);
	if (choices.length < 2) return [st];
	ctx.report.count("menu of options: a step per option, tick one and skip the others", choices.length);
	return choices.map((c, i) => ({
		...st, ...(i ? { label: null, starts: [], stops: [], pre: [], path: [], way: null, first: false } : {}),
		goals: i ? [c] : [...st.goals.filter((g) => g._next === undefined), c],
		// An option without a label goes on after the menu: past the options after it.
		nexts: [...(i ? [] : st.nexts.filter((n) => !choices.some((o) => o._next === n.label))),
			...(c._next ? st.nexts.filter((n) => n.label === c._next).slice(0, 1) : [{ label: "", only: {}, whens: [], alts: [], ahead: choices.length - i, line: "" }])],
	}));
}

// The steps' goals after the rules that look across the step: talk to a giver or
// vendor the step names anyway is dropped; text alone holds as a task.
function finish(st, ctx) {
	let goals = st.goals;
	// A profession's trainer is the NPC the step talks to (Polestar names one when it has no professions data).
	// Several trainers, one per race (`talk A |only if Human`, `talk B |only if Dwarf`): a train
	// or learn per trainer, for its races; one for everyone else is left to Polestar's nearest.
	const talks = goals.filter((g) => g.kind === "talk");
	if (!st.nearest && talks.length > 1 && talks.every((t) => t.only)) {
		const out = [];
		for (const g of goals) {
			if ((g.kind === "train" && g.profession || g.kind === "learn") && !g.npc) out.push(...talks.map((t) => ({ ...g, npc: t.npc, only: t.only })));
			else out.push(g);
		}
		if (out.length !== goals.length) { goals = out.filter((g) => g.kind !== "talk"); ctx.report.count("trainers per race -> a train or learn per trainer"); }
	}
	const talkTo = st.nearest || talks.length > 1 ? null : goals.find((g) => g.kind === "talk");
	if (talkTo) for (const g of goals) if ((g.kind === "train" && g.profession || g.kind === "learn") && !g.npc) g.npc = talkTo.npc;
	if (goals.some((g) => ["accept", "turnin", "vendor", "train"].includes(g.kind) || g.kind === "learn" && g.npc)) {
		const before = goals.length;
		goals = goals.filter((g) => g.kind !== "talk");
		if (goals.length !== before) ctx.report.count("talk to a giver or vendor the step already names (dropped)");
	}
	// A standing with a faction Polestar names otherwise ("Stormwind City": "Stormwind"); one it
	// does not know is a task with the step's words.
	goals = goals.map((g) => {
		if (g.kind !== "rep") return g;
		const name = factionNamed(ctx.data, g.faction);
		if (name) return { ...g, faction: name };
		ctx.report.count("rep of a faction Polestar does not know (a task)");
		return { kind: "task", text: `Reach ${g.standing} with ${g.faction}`, only: g.only };
	});
	// A heading ("Inside Deeprun Tram:") shows above the step; it names no task.
	const tips = [...st.tips, ...st.texts.filter((t) => /:$/.test(t))];
	st.texts = st.texts.filter((t) => !/:$/.test(t));
	// `|or` beside a check Polestar can ask (`collect 50 Cloth |or` / `|complete skill("Tailoring") >= 50 |or`):
	// the check holds instead, so the step is for those it does not hold for yet. A place to reach
	// (`|complete subzone(...)`) stays the goal the step leads to (below).
	// A check that jumps (`'|complete itemcount(100) >= 1 |next "X"`) is the jump's (a skipto), not the step's.
	if (goals.some((g) => g._or && !g._jump)) goals = goals.filter((g) => !(g._or && g._cond && g._jump));
	const conds = goals.filter((g) => g._or && g._cond && g.kind !== "enter");
	if (conds.length && goals.some((g) => g._or && !g._cond)) {
		const asked = conds.map((g) => translate(g._cond.replace(/\s*>=\s*/, " >= "), {}));
		if (asked.every((c) => c.whens.length === 1 && !c.alts.length && !c.dropped.length && !Object.keys(c.only).length)) {
			st.whens = [...st.whens, ...asked.map((c) => negWhen(c.whens[0]))];
			goals = goals.filter((g) => !conds.includes(g));
			ctx.report.count("|or beside a check: the step for those the check does not hold for", conds.length);
		} else {
			// A check Polestar cannot ask (a standing): the other ways to end the step stay, it goes.
			goals = goals.filter((g) => !conds.includes(g));
			ctx.report.count("|or beside a check Polestar cannot ask: the check left out", conds.length);
			for (const g of conds) gapOf(ctx, { no: st.no }, g._cond, `"${g._cond}" as another way to end the step has no Polestar form; left out`, true);
		}
	}
	// Zygor's `|or`: one of the goals ends the step. Kills on the way there do not hold it.
	if (goals.some((g) => g._or && FARM.has(g.kind)) && goals.some((g) => g._or && !FARM.has(g.kind))) {
		for (const g of goals) if (g._or && FARM.has(g.kind)) g.optional = true;
		ctx.report.count("|or: farming beside a way (optional)");
	}
	const farms = goals.some((g) => g.kind === "collect" || g.kind === "kill");
	const texts = [...new Set(st.texts)].filter((t) => !(farms && (st.kills || []).includes(t)));
	for (const g of goals) if (g._generic && texts.length) g.text = texts.shift();
	if (!goals.length) {
		// A way line alone ("Leave the cave |goto … < 15"): Zygor passes it on arrival, so does a goto.
		// Way lines, each to its own point with its own text ("Run down the path", then "Enter the cave").
		if (st.wayLines.length && st.wayLines.every((x) => texts.includes(x.text))) {
			for (const { w, text } of st.wayLines) { goals.push({ kind: "goto", x: w.x, y: w.y, live: true, map: w.uiMap, text, only: "", _map: w.uiMap }); texts.splice(texts.indexOf(text), 1); }
			st.way = null;
		} else if (st.uses.length === 1 && texts.includes(st.uses[0].text)) {
			goals.push({ kind: "use", item: st.uses[0].item, only: "" });
			texts.splice(texts.indexOf(st.uses[0].text), 1);
		} else if (texts.length && st.way) { const w = st.way; goals.push({ kind: "goto", x: w.x, y: w.y, live: true, map: w.uiMap, text: texts.shift(), only: "", _map: w.uiMap }); st.way = null; }
		else if (texts.length) goals.push({ kind: "task", text: texts.shift(), only: "" });
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

// `condition_suggested=function() return level >= 15 and level <= 25 ... end` -> "15-25".
function suggestedLevels(text) {
	const m = /level\s*>=\s*(\d+)\s*and\s*level\s*<=\s*(\d+)/.exec(String(text || ""));
	return m && Number(m[1]) <= Number(m[2]) ? `${m[1]}-${m[2]}` : null;
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
		// A step of ways alone leads into the next one: its last point is where that one starts.
		const ways = st.goals.filter((g) => g.kind === "goto");
		ctx.wayBefore = ways.length && ways.length === st.goals.length ? { x: ways.at(-1).x, y: ways.at(-1).y, uiMap: ways.at(-1).map } : null;
		if (carry.label && !st.label) st.label = carry.label;
		st.starts = [...carry.starts, ...st.starts];
		st.stops = [...carry.stops, ...st.stops];
		carry = { label: null, starts: [], stops: [] };
		// Way lines for some places only, each a goto step before the step (see lineOf).
		for (const p of st.pre) {
			irSteps.push({ ...st, goals: [p.goal], texts: [], tips: [], notes: [], nexts: [], pre: [], starts: [], stops: [], label: null, rawLabel: null, wayKeep: null,
				only: andOnly(st.only, p.only), whens: [...st.whens, ...p.whens], alts: crossAlts(st.alts, p.alts) });
			ctx.pendingWay = null;
		}
		// A step with no goal passes its way on to the next step (as RXP's way).
		if (!st.goals.length) { ctx.pendingWay = st.way || ctx.pendingWay; continue; }
		const way = waySpot(st.goals, st.way || ctx.pendingWay);
		ctx.pendingWay = null;
		for (const part of splitByCondition(st, ctx).flatMap((p) => splitChoices(p, ctx))) irSteps.push({ ...part, wayKeep: part.first === false ? null : way, rawLabel: part.label });
	}
	// Carry-over labels of dropped steps ended up on the next step; a trailing one has no step.
	if (carry.label) report.count("label of a last step that is dropped (no step to name)");

	// Jumps: forward only; a backward or missing target is gapped.
	const indexOfLabel = (name, from) => irSteps.findIndex((t, j) => j > from && t.rawLabel === name);
	for (const s of irSteps) s.skipto = [];
	irSteps.forEach((s, p) => {
		for (const n of s.nexts) {
			if (n.blocked) { report.count("|next on a check Polestar cannot ask (dropped)"); gapOf(ctx, { no: s.no }, n.line, `jump to "${n.label}" on a check Polestar cannot ask; dropped`, false); continue; }
			// A menu option without a label goes on after the menu (see splitChoices).
			if (n.ahead) {
				const t = irSteps[p + n.ahead];
				if (n.ahead > 1 && t) { t.rawLabel = t.rawLabel || `after-${s.no}`; irSteps[p + 1].skipto.push({ target: t, doneOf: s }); s.rawLabel = s.rawLabel || `jump-${s.no}`; }
				continue;
			}
			if (Object.keys(n.only).length) { report.count("|next on a class line: no Polestar form (jump dropped)"); gapOf(ctx, { no: s.no }, n.line, "jump for a class: no Polestar form, jump dropped", false); continue; }
			const j = indexOfLabel(n.label, p);
			if (j < 0) {
				report.count("|next backward or to no label (dropped)");
				gapOf(ctx, { no: s.no }, n.line, `jump to "${n.label}" is backward or has no label; dropped`, false);
				continue;
			}
			if (j === p + 1) { report.count("|next to the next step (no jump)"); continue; }
			// On a check (`'|complete <check> |next "X"`): jump on arrival while it holds; several lines
			// are an OR (the first that holds decides), several predicates in one an AND Polestar lacks.
			const ways = n.alts?.length ? n.alts : n.whens.length ? [n.whens] : [];
			if (ways.some((w) => w.length > 1)) { report.count("|next on several predicates (dropped)"); gapOf(ctx, { no: s.no }, n.line, "jump on several predicates (and): no Polestar form, dropped", false); continue; }
			if (ways.length) {
				for (const [when] of ways) if (!s.skipto.some((k) => k.target === irSteps[j] && k.when === when)) s.skipto.push({ target: irSteps[j], when });
				report.count("|next on a check -> skipto");
				continue;
			}
			// On a goal line Zygor jumps once the goal is done, so the step after it jumps: when the quest
			// is handed in, else when this step is done. On arrival here it would skip the goal itself.
			const nextStep = irSteps[p + 1];
			if (!nextStep) { report.count("|next of the last step (no step to jump from)"); continue; }
			if (n.goal?.kind === "turnin") {
				const when = `turnedin ${n.goal.quest}`;
				if (!nextStep.skipto.some((k) => k.target === irSteps[j] && k.when === when)) nextStep.skipto.push({ target: irSteps[j], when });
				report.count("|next on a turn-in -> skipto on the next step when handed in");
				continue;
			}
			// Without a goal or a check: once this step is done, the next one jumps (`skipto X when done <this step>`).
			{
				s.rawLabel = s.rawLabel || `jump-${s.no}`;
				if (!nextStep.skipto.some((k) => k.target === irSteps[j] && k.doneOf === s)) nextStep.skipto.push({ target: irSteps[j], doneOf: s });
				report.count("|next once the step is done -> skipto on the next step when done");
			}
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
			copies.push({ before: s, step: { stepNo: L.stepNo || L.no, title: null, only: L.only, whens: L.whens, alts: L.alts || [], goals, tips: [], notes: [], maps: [], loop: [], allAlong: true, skipto: [], format: formatOf({ goals, skipto: [], whens: L.whens }), sticky: false, completesWith: null, label: null, alongTarget: target } });
			report.count(k >= 0 ? "sticky: along until a stop" : "sticky: along until the label");
		}
	});

	// Labels: unique per guide, the ones some step names.
	const taken = new Set();
	const fresh = (base) => { let n = 1, c = base; while (taken.has(c)) c = `${base}-${++n}`; taken.add(c); return c; };
	for (const s of irSteps) if (s.rawLabel) s.label = fresh(labelOf(s.rawLabel) || "step");
	for (const c of copies) c.step.alongUntil = c.step.alongTarget.label;
	for (const s of irSteps) for (const k of s.skipto) { k.label = k.target.label; if (k.doneOf) k.when = `done ${k.doneOf.label}`; }
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
	const maybeQ = new Set();
	const acceptsHere = (out, q) => out.goals.some((x) => x.kind === "accept" && x.quest === q);
	const splitOrphans = (out, copy) => {
		const main = [];
		const orphan = new Map();
		for (const g of out.goals) {
			// An accept under a `when` may not happen: its quest's later goals wait for it in the log.
			if (g.kind === "accept") (out.whens.length ? maybeQ : seenQ).add(g.quest);
			// An along copy shows only what is in the log anyway: a maybe-taken quest stays in it.
			const waits = !seenQ.has(g.quest) && !(copy && maybeQ.has(g.quest)) && !out.whens.includes(`onquest ${g.quest}`);
			if (QUEST_KINDS.has(g.kind) && g.quest != null && waits && !acceptsHere(out, g.quest)) {
				if (!orphan.has(g.quest)) orphan.set(g.quest, []);
				orphan.get(g.quest).push(g);
			} else main.push(g);
		}
		if (!orphan.size) return [out];
		if (copy) { report.count("sticky copy: goals of quests not accepted before it (left out)"); return main.length ? [{ ...out, goals: main }] : []; }
		report.count("goals of quests not accepted earlier -> when onquest");
		const pre = [...orphan].map(([q, gs]) => ({ ...out, goals: gs, tips: [], notes: [], maps: [], whens: [...out.whens, `onquest ${q}`], label: null, skipto: [], alongUntil: null, format: formatOf({ goals: gs, skipto: [], whens: [`onquest ${q}`] }) }));
		// All of the step waits: its first part keeps the tips, its last the label.
		if (!main.length) { pre[0].tips = out.tips; if (out.label) pre[pre.length - 1].label = out.label; return pre; }
		return [...pre, { ...out, goals: main }];
	};
	// The label of a step left out goes to the next one written.
	let heldLabel = null;
	for (const s of withCopies) {
		const maps = [];
		// A gathering route is where Polestar searches for the step's kills and collects (`loop`);
		// beside a goal it cannot search along (a skill to reach), its first point leads there.
		const path = s.path || [];
		const loopable = s.goals.some((g) => FARM.has(g.kind) && !g.at);
		let way = s.wayKeep;
		if (path.length && !loopable) {
			way = way || path[0];
			report.count("gathering route beside a goal without a search (its first point as the way)");
			gapOf(ctx, { no: s.no }, "path", "gathering route: Polestar searches only kills and collects along a route; its first point kept", true);
		}
		if (path.length && loopable) { maps.push(path[0].uiMap); report.count("gathering route -> loop"); }
		if (way) maps.push(way.uiMap);
		for (const g of s.goals) if (g._map != null) maps.push(g._map);
		const wayGoal = way ? [{ kind: "goto", x: way.x, y: way.y, live: true, map: way.uiMap, optional: true, only: "" }] : [];
		// A point on another map than the step's zone names its map (a jump from Dun Morogh into Wetlands).
		const goals = [...wayGoal, ...s.goals].map((g) => { const { _map, _notSticky, _whens, _alts, _learned, _cond, _or, _next, _jump, ...rest } = g; return rest.at && _map != null && _map !== maps[0] ? { ...rest, at: { ...rest.at, map: _map } } : rest; });
		if (!goals.length) continue;
		const out = { stepNo: s.stepNo || s.no, title: null, only: s.only, whens: s.whens, goals, tips: s.tips || [], notes: [], maps: [...new Set(maps)], loop: loopable ? path : [], allAlong: !!s.alongTarget, label: s.label || null, alongUntil: s.alongUntil || null, skipto: (s.skipto || []).map((k) => ({ label: k.label, when: k.when })), format: formatOf({ goals, skipto: s.skipto || [], whens: s.whens }) };
		// An OR: a copy per alternative, none overlapping, so the player meets one; the first keeps the label.
		// A copy whose conditions cannot all hold (has and !has of one item) is left out.
		const alts = (s.alts || []).map((a) => tidy([...s.whens, ...a])).filter(Boolean);
		if ((s.alts || []).length && !alts.length) { report.count("step whose conditions cannot all hold (dropped)"); continue; }
		const outs = alts.length ? alts.map((whens, i) => ({ ...out, whens, label: i ? null : out.label, format: formatOf({ goals, skipto: s.skipto || [], whens }) })) : [out];
		for (const o of outs) for (const part of splitOrphans(o, !!s.alongTarget)) {
			// A copy for a quest handed in whose goals wait for that quest in the log: never seen.
			if (!tidy(part.whens)) { report.count("step whose conditions cannot all hold (dropped)"); heldLabel = heldLabel || part.label; continue; }
			if (heldLabel && !part.label) part.label = heldLabel;
			heldLabel = null;
			steps.push(part);
		}
	}
	// An abandon of a quest the guide takes again later stays a task: Polestar would send the route
	// back to the quest's earlier goals (a known Polestar bug).
	steps.forEach((s, i) => {
		s.goals = s.goals.map((g) => {
			if (g.kind !== "abandon") return g;
			const again = steps.slice(i + 1).some((t) => t.goals.some((x) => x.kind === "accept" && x.quest === g.quest));
			const { _text, ...rest } = g;
			if (!again) return rest;
			report.count("abandon of a quest taken again later (a task)");
			return { kind: "task", text: _text, only: g.only };
		});
	});
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
		// Polestar needs levels: the name's, the quests', else the whole range (a profession).
		levels: nameLevels || suggestedLevels(header.condition_suggested) || levelsOf([...accepted].filter((id) => !(opts.before || new Set()).has(id)), data) || "1-60",
		zone,
		defaultMap,
		category: klass ? "Class" : opts.category || "Leveling",
		folder: opts.folder || null,
		sourceSteps: guide.steps.length,
		steps,
	};
	if (!guideOut.zone) report.note(guide.name, 0, "no zone for the guide; check the header", "");
	const r = render(guideOut, { report, slug, packId, next: opts.next || [] });
	const gaps = ctx.gaps;
	return { text: r.text, format: r.format, levels: r.levels, stepsIn: guide.steps.length, stepsOut: r.stepsOut, accepted, gaps };
}
