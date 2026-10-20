// Parsed RXP guide -> the intermediate form (src/ir.mjs) plus a report of
// everything that was not carried over one to one. Nothing is guessed: an id the
// data does not know is quoted by name or the line becomes a `task`/`note`, and
// the report says so.

import { parseCondition, onlyText, CLASSES } from "../cond.mjs";
import { plain, parseName } from "./parse.mjs";
import { worldToZone, zoneName, findNpc, questOpenTo } from "../data.mjs";
import { render } from "../emit.mjs";
import { bare, questOf } from "../ir.mjs";

const IGNORED = new Set([
	"target", "mob", "unitscan", "itemcount", "isOnQuest", "isQuestTurnedIn", "isQuestComplete", "cooldown", "macro", "timer",
	"skipgossip", "skipgossipid", "zoneskip", "subzone", "subzoneskip", "maxlevel", "disablecheckbox", "is", "item", "addquestitem",
	"bindlocation", "trainer", "dungeon", "itemStat", "zone", "isQuestAvailable",
]);
const TASKS = new Set(["hs", "home", "fp", "deathskip", "abandon", "destroy", "cast", "equip"]);
const PROFESSIONS = new Set(["Mining", "Herbalism", "Skinning", "Alchemy", "Blacksmithing", "Enchanting", "Engineering", "Leatherworking", "Tailoring", "First Aid", "Cooking", "Fishing"]);
const DROP_TAGS = new Set(["hardcore", "ssf", "ah"]);


function parseGoto(args, data, ctx) {
	// "1420/0,1234.56,2345.67[,r[,flag]]" or "Invented Vale,50.0,50.0[,r]"
	const parts = args.split(",").map((s) => s.trim());
	if (parts.length < 3) return null;
	let uiMap = null, x = parseFloat(parts[1]), y = parseFloat(parts[2]);
	const mapPart = parts[0];
	const world = mapPart.match(/^(\d+)\/\d+$/);
	if (world) {
		uiMap = Number(world[1]);
		const z = worldToZone(data, uiMap, x, y);
		if (!z) { ctx.report.count("goto: map without frame"); return null; }
		return { uiMap, x: z.x, y: z.y, live: z.live, r: parts[3] != null ? parseFloat(parts[3]) : null };
	}
	return { uiMap: null, x, y, live: false, r: parts[3] != null ? parseFloat(parts[3]) : null, zoneText: mapPart };
}

function normName(text) {
	return plain(text).toLowerCase().replace(/\(.*?\)/g, "").replace(/\bx\d+\b/g, "")
		.replace(/^(kill|collect|loot|free|talk to|use|find|click|cast|escort|speak with)\s+/g, "").replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim();
}

// Match an RXP objective to Polestar's by the name RXP prints, not by the
// number: the two number the objectives differently (e.g. quest 376).
function resolveObjective(quest, label, itemId) {
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

// `.abandon <quest>` and `.destroy <item>[,count]` as Polestar goals, or null when the
// quest or item is not in Polestar's data (the caller then falls back to a task).
function nativeGoal(n, l, data) {
	const id = Number(String(l.args).split(",")[0]);
	if (!(id > 0)) return null;
	if (n === "abandon" && data.quests && data.quests[id]) return { goal: { kind: "abandon", quest: id }, format: 6 };
	if (n === "destroy" && data.items && data.items[id]) return { goal: { kind: "destroy", item: id }, format: 6 };
	return null;
}

function buildStep(step, stepNo, data, ctx) {
	const { report } = ctx;
	const cond = parseCondition(step.cond);
	cond.unknown.forEach((u) => report.note(ctx.name, stepNo, `unknown condition word "${u}"`, step.cond));
	if (cond.never) { report.count("step: impossible condition (dropped)"); return null; }

	for (const t of step.tags) {
		if (DROP_TAGS.has(t.name)) { report.count(`step: #${t.name} variant (dropped)`); return null; }
	}
	const tag = (n) => step.tags.find((t) => t.name === n);
	const completewith = tag("completewith");
	const isLoop = !!tag("loop");
	const labelDef = tag("label") ? tag("label").args : null;
	for (const t of step.tags) {
		if (!["completewith", "label", "loop", "softcore", "optional"].includes(t.name)) report.count(`tag #${t.name} (ignored)`);
	}

	// Pass 1: places, names.
	const gotos = [];
	const targets = [];
	let buyText = false;
	for (const l of step.lines) {
		if (l.kind === "cmd" && l.name === "goto") {
			const g = parseGoto(l.args, data, ctx);
			if (g) { g.cond = l.cond; gotos.push(g); }
		} else if (l.kind === "cmd" && l.name === "target") {
			targets.push(l.args.replace(/^\+/, "").trim());
		}
		if ((l.text || "").includes("RXP_BUY")) buyText = true;
	}
	const mapId = (gotos.find((g) => g.uiMap) || {}).uiMap || null;
	const firstPt = gotos.length ? gotos[gotos.length - 1] : null;
	const npcFor = (role) => {
		const cands = [];
		for (const name of targets) {
			const r = findNpc(data, name, mapId, firstPt);
			if (r.npc) cands.push(r.npc);
		}
		return cands.find((n) => (n.roles || []).includes(role)) || (cands.length === 1 ? cands[0] : null);
	};

	// RXP lists a .goto after the giver's lines or before them; for a quest the
	// data does not know, take the first .goto after the line, else the last before.
	const placeFor = (lineIdx) => {
		const here = (i) => step.lines[i].kind === "cmd" && step.lines[i].name === "goto";
		for (let i = lineIdx + 1; i < step.lines.length; i++) {
			const c = step.lines[i];
			if (c.kind === "cmd" && (c.name === "accept" || c.name === "turnin")) break;
			if (here(i)) { const g = parseGoto(c.args, data, ctx); if (g) return g; }
		}
		for (let i = lineIdx - 1; i >= 0; i--) if (here(i)) { const g = parseGoto(step.lines[i].args, data, ctx); if (g) return g; }
		// Last resort: the step's first place. A guess, so the report lists it.
		const first = gotos.find((g) => g.uiMap);
		if (first) report.note(ctx.name, stepNo, "place of an unknown quest taken from the step's first .goto (check)", step.lines[lineIdx].args);
		return first || null;
	};
	const usedMaps = [];
	const at = (g) => { if (g && g.uiMap) usedMaps.push(g.uiMap); return g ? { x: g.x, y: g.y, live: g.live } : undefined; };

	// Pass 2: goals.
	const goals = [];
	const whens = [];
	const tips = [];
	const notes = [];
	let title = null;
	let formatNeeds = 4;
	let closed = 0;
	const add = (goal, lineCond) => {
		const lc = parseCondition(lineCond);
		const mine = {};
		for (const k of Object.keys(lc.only)) mine[k] = lc.only[k];
		const quest = goal.quest != null ? data.quests[goal.quest] : null;
		const races = mine.race || cond.only.race || (ctx.races.length ? ctx.races : null);
		if (quest && !questOpenTo(data, quest, ctx.faction, races)) {
			closed++;
			report.count("goal for a quest the data closes to these races (dropped)");
			report.note(ctx.name, stepNo, `quest ${goal.quest} (${quest.title}) is not open to ${ctx.faction || "these"} races in the data; ${goal.kind} left out`);
			return;
		}
		goals.push({ ...goal, only: onlyText(mine) });
	};

	for (let li = 0; li < step.lines.length; li++) {
		const l = step.lines[li];
		if (l.kind === "text") {
			const t = plain(l.text);
			if (!t) continue;
			if ((l.text || "").includes("chatbubble")) continue; // "Talk to X": accept/turnin say it
			if (!l.cond) tips.push(bare(t));
			else {
				const o = onlyText(parseCondition(l.cond).only);
				if (o) { goals.push({ kind: "note", text: t, only: o }); report.count("class-specific text -> note only"); }
			}
			continue;
		}
		if (l.kind === "note") {
			const t = plain(l.text);
			if (t && !l.cond) notes.push(bare(t));
			else if (t) {
				const o = onlyText(parseCondition(l.cond).only);
				if (o) { goals.push({ kind: "note", text: t, only: o }); report.count("class-specific text -> note only"); }
			}
			continue;
		}
		const n = l.name;
		const lineQuestId = Number((l.args.match(/^(\d+)/) || [])[1]);
		if ((n === "accept" || n === "turnin") && !lineQuestId) { report.count(`.${n} (no quest id, ignored)`); continue; }
		if (n === "accept" || n === "turnin") {
			const known = data.quests[lineQuestId];
			if (n === "accept") ctx.seen.add(lineQuestId);
			if (known) add({ kind: n, quest: lineQuestId }, l.cond);
			else {
				const title = plain(l.text).replace(/^(accept|turn in)\s+/i, "");
				add({ kind: n, quest: lineQuestId, title, at: at(placeFor(li)) }, l.cond);
				report.note(ctx.name, stepNo, `quest ${lineQuestId} unknown to the data; quoted by name`, l.text);
			}
			if (!title) title = plain(l.text).replace(/^(accept|turn in)\s+/i, "");
		} else if (n === "complete") {
			const m = l.args.match(/^(\d+)(?:,(\d+))?/);
			if (!m) { report.count(".complete (unparsed, ignored)"); report.note(ctx.name, stepNo, "unparsed .complete", l.args); continue; }
			const quest = data.quests[Number(m[1])];
			if (!quest) { add({ kind: "complete", quest: Number(m[1]), title: ctx.titles.get(Number(m[1])) || plain(l.text) || "quest " + m[1], at: at(placeFor(li)) }, l.cond); report.note(ctx.name, stepNo, `quest ${m[1]} unknown to the data`, l.args); continue; }
			if (m[2] == null) {
				// A quest without objectives completes by the turn-in; a `complete` would only warn.
				if ((quest.objectives || []).length === 0) { report.count("complete on a quest without objectives (dropped)"); continue; }
				add({ kind: "complete", quest: Number(m[1]) }, l.cond); continue;
			}
			const hit = resolveObjective(quest, l.comment || l.text || "", null);
			if (hit && hit.obj.type === "kill") add({ kind: "kill", npc: hit.obj.id, quest: Number(m[1]), oi: hit.index }, l.cond);
			else if (hit && hit.obj.type === "item") add({ kind: "collect", item: hit.obj.id, quest: Number(m[1]), oi: hit.index }, l.cond);
			else if (hit && hit.obj.type === "object") add({ kind: "interact", object: hit.obj.id, quest: Number(m[1]), oi: hit.index }, l.cond);
			else { add({ kind: "complete", quest: Number(m[1]) }, l.cond); report.note(ctx.name, stepNo, "objective not matched by name; whole quest used", `${l.args} ${l.comment || ""}`); }
		} else if (n === "collect") {
			const [item, count, qid] = l.args.split(",").map((s) => s.trim());
			const itemId = Number(item);
			const known = data.items[itemId];
			const itemName = known ? undefined : plain(l.comment || l.text || "item " + itemId);
			if (buyText) {
				const npc = npcFor("vendor");
				add({ kind: "buy", item: itemId, itemName, count: count || 1, npc: npc ? npc.id : undefined }, l.cond);
				if (!npc) report.note(ctx.name, stepNo, "vendor not resolved; `nearest` used", l.comment || "");
			} else if (qid && data.quests[Number(qid)]) {
				const hit = resolveObjective(data.quests[Number(qid)], "", itemId);
				// RXP often collects ahead of the accept; Polestar wants the accept first,
				// so an early pick-up counts the bag instead of the quest objective.
				const early = !ctx.seen.has(Number(qid)) && ctx.accepted.has(Number(qid));
				if (early) { add({ kind: "collect", item: itemId, itemName, count: count || (hit && hit.obj.count) || 1 }, l.cond); report.count("collect before accept -> bag count"); }
				else if (hit) add({ kind: "collect", item: itemId, itemName, quest: Number(qid), oi: hit.index }, l.cond);
				else add({ kind: "collect", item: itemId, itemName, count: count || 1 }, l.cond);
			} else add({ kind: "collect", item: itemId, itemName, count: count || 1 }, l.cond);
		} else if (n === "vendor") {
			const npc = npcFor("vendor");
			add({ kind: "vendor", npc: npc ? npc.id : undefined }, l.cond);
			if (!npc) report.note(ctx.name, stepNo, "vendor not resolved; `nearest` used", plain(l.text));
		} else if (n === "train") {
			const note = plain(l.text);
			// "Train [Mining]": a profession has its own trainers, not the class trainer.
			const prof = (note.match(/\[([^\]]+)\]/) || [])[1];
			if (prof && PROFESSIONS.has(prof)) {
				const pnpc = npcFor("trainer");
				add({ kind: "train", profession: prof, npc: pnpc ? pnpc.id : undefined }, l.cond);
				report.count(".train profession -> train <Profession>");
				continue;
			}
			const npc = npcFor("trainer");
			const lineClasses = parseCondition(l.cond).only.class || cond.only.class || CLASSES;
			if (npc) add({ kind: "train", npc: npc.id, comment: note || undefined }, l.cond);
			else {
				// Data gap: Polestar has no Horde Paladin class trainer (lint/playtest say so).
				const rest = lineClasses.filter((c) => c !== "Paladin");
				if (lineClasses.includes("Paladin")) {
					add({ kind: "task", text: note || "Train at your class trainer" }, "Paladin"); formatNeeds = 5;
					report.count("train (Paladin, no trainer in data) -> task");
				}
				if (rest.length) {
					add({ kind: "train", class: true, comment: note || undefined }, rest.length < CLASSES.length ? rest.join("/") : null);
					report.note(ctx.name, stepNo, "trainer not resolved; `train class` used", note);
				}
			}
		} else if (n === "use") {
			const id = Number(l.args.split(",")[0]);
			if (data.items[id]) add({ kind: "use", item: id }, l.cond);
			else { add({ kind: "task", text: plain(l.text) || "Use item " + id }, l.cond); formatNeeds = 5; }
		} else if (n === "xp") {
			// RXP: ".xp <12,1" skips the step while below level 12 (second number = skip);
			// ".xp 16,1" / ".xp >16,1" skips it from level 16 on; ".xp 3+895" is a grind goal.
			const m = l.args.match(/^([<>]?)\s*(\d+)(?:\+(\d+))?(?:,\s*(-?\d+))?$/);
			if (!m) report.count(".xp (unparsed)");
			else if (m[4] && Number(m[4]) !== 0 && !l.cond) {
				const lv = m[3] ? `${m[2]}+${m[3]}` : m[2];
				whens.push(m[1] === "<" ? `level>=${lv}` : `level<${lv}`);
				report.count(".xp skip form -> when level");
			} else if (!m[4] && m[1] === "" && m[3]) { add({ kind: "level", level: Number(m[2]), xp: Number(m[3]) }, l.cond); report.count(".xp L+N -> level"); }
			else report.count(".xp (ignored)");
		} else if (n === "skill") {
			const m = l.args.match(/^([a-z]+),\s*(\d+)$/i);
			const NAMES = { firstaid: "First Aid", cooking: "Cooking", fishing: "Fishing", mining: "Mining", herbalism: "Herbalism", skinning: "Skinning" };
			if (m && NAMES[m[1].toLowerCase()]) { add({ kind: "skill", skill: NAMES[m[1].toLowerCase()], n: Number(m[2]) }, l.cond); report.count(".skill -> skill"); }
			else report.count(".skill (ignored)");
		} else if (n === "money") {
			// Counting the character's money does not hold up in play (selling junk, repairs):
			// RXP's step is ticked by the player, so the goal is dropped and the text stays.
			report.count(".money (dropped: not a reliable goal)");
		} else if (ctx.native.has(n) && nativeGoal(n, l, data)) {
			// A verb Polestar has gained (abandon, destroy): the goal checks itself instead of a tick.
			const g = nativeGoal(n, l, data);
			add(g.goal, l.cond);
			formatNeeds = Math.max(formatNeeds, g.format);
			report.count(`.${n} -> ${n} (native verb)`);
		} else if (TASKS.has(n)) {
			const t = plain(l.text) || n;
			if (n === "destroy") { const id = Number(l.args.split(",")[0]); if (data.items[id] && !l.cond) whens.push(`has ${id}`); }
			add({ kind: "task", text: t }, l.cond);
			formatNeeds = 5;
			report.count(`.${n} -> task`);
		} else if (n === "goto") {
			// handled below
		} else if (IGNORED.has(n)) {
			report.count(`.${n} (ignored)`);
		} else {
			report.count(`.${n} (unknown)`);
			report.note(ctx.name, stepNo, `unknown command .${n}`, l.args);
		}
	}

	if (goals.length && goals.every((g) => g.kind === "note")) {
		for (const g of goals) g.kind = "task";
		formatNeeds = 5;
		report.count("instruction-only step -> task");
	}
	const placeable = gotos.filter((g) => g.r !== 0 || gotos.length === 1);

	if (!goals.length && closed) {
		report.count("step: every goal closed to these races (dropped)");
		return null;
	}
	// A step of walking only: RXP's waypoints, nothing to tick.
	if (!goals.length && (completewith || (!notes.length && !gotos.length))) {
		if (gotos.length || tips.length || notes.length) report.count("step: waypoints/text only (dropped)");
		return null;
	}
	if (!goals.length && !notes.length && gotos.length) {
		const g = gotos[gotos.length - 1];
		if (g.uiMap) usedMaps.push(g.uiMap);
		goals.push({ kind: "goto", x: g.x, y: g.y, live: g.live, text: tips[0] ? tips[0].slice(0, 40) : undefined, only: "" });
	}

	const allAlong = goals.length > 0 && goals.every((g) => ["kill", "collect", "complete", "buy"].includes(g.kind) && /quest \d+\.\d+|xN|buy|complete/.test(g.text + " buy complete"));
	// A goal the data places (giver, vendor, trainer) sits where RXP's own .goto points.
	if (!usedMaps.length && mapId && goals.some((g) => ["accept", "turnin", "vendor", "train", "buy", "complete"].includes(g.kind))) usedMaps.push(mapId);
	const orphanOf = (g) => {
		const id = questOf(g);
		return id != null && !ctx.seen.has(id) ? id : null;
	};
	const orphanGoals = goals.filter((g) => orphanOf(g));
	const base = {
		stepNo, title: title || tips[0] || notes[0] || null, only: cond.only, goals, tips, notes, whens, maps: usedMaps, loop: isLoop ? placeable : [],
		completesWith: completewith ? completewith.args : null, label: labelDef, format: formatNeeds, allAlong,
	};
	if (!orphanGoals.length) return [base];
	// A quest taken up in an earlier file (or left out of this one): its goals go
	// in their own step that only applies while the quest is in the log.
	const ids = [...new Set(orphanGoals.map(orphanOf))];
	report.count(`goals for quests accepted elsewhere -> when onquest (${orphanGoals.length})`);
	const rest = goals.filter((g) => !orphanOf(g));
	const orphanStep = { ...base, maps: [], goals: orphanGoals, tips: [], notes: [], whens: [...whens, `onquest ${ids.join(",")}`], label: null, completesWith: null, loop: [] };
	if (!rest.length) return [{ ...orphanStep, tips, notes }];
	return [{ ...base, goals: rest }, orphanStep];
}

// A guide whose name gives no levels (dungeon quest guides): the range of the
// quests it takes, from the lowest level they can be taken at to the highest quest.
function levelsOf(quests, data) {
	let lo = Infinity, hi = 0;
	for (const id of quests) {
		const q = data.quests[id];
		if (!q || !(q.level > 0)) continue;
		lo = Math.min(lo, q.minLevel > 0 ? q.minLevel : q.level);
		hi = Math.max(hi, q.level);
	}
	return hi ? `${lo}-${hi}` : null;
}

export function convertGuide(parsed, data, opts) {
	const { report, slug, packId } = opts;
	const info = parseName(parsed.header.name);
	const titles = new Map();
	for (const s of parsed.steps) for (const l of s.lines) {
		if (l.kind === "cmd" && (l.name === "accept" || l.name === "turnin") && l.text) {
			const id = Number((l.args.match(/^(\d+)/) || [])[1]);
			if (id && !titles.has(id)) titles.set(id, plain(l.text).replace(/^(accept|turn in)\s+/i, ""));
		}
	}
	// `before`: quests accepted in the guides that hand off into this one.
	// `seen` grows with this guide's accepts in route order; a goal for a quest
	// not seen yet goes in a step of its own that waits for the quest.
	const before = opts.before || new Set();
	const accepted = new Set(before);
	for (const s of parsed.steps) for (const l of s.lines) {
		if (l.kind === "cmd" && l.name === "accept") accepted.add(Number((l.args.match(/^(\d+)/) || [])[1]));
	}
	const hc = parseCondition(parsed.header.faction).only;
	const df = parseCondition((parsed.header.defaultfor || "").replace(/,/g, " ")).only;
	const faction = hc.faction ? hc.faction[0] : null;
	const races = hc.race || df.race || [];
	const ctx = { report, name: parsed.header.name || slug, titles, accepted, seen: new Set(before), native: opts.native || new Set(), faction, races };
	const steps = [];
	parsed.steps.forEach((s, i) => {
		for (const b of buildStep(s, i + 1, data, ctx) || []) steps.push(b);
	});

	let defaultMap = null;
	const zone = (() => {
		for (const s of parsed.steps) for (const l of s.lines) if (l.kind === "cmd" && l.name === "goto") {
			const m = l.args.match(/^(\d+)\//);
			if (m) { defaultMap = Number(m[1]); return zoneName(data, defaultMap); }
		}
		return info.zone;
	})();
	const guide = {
		name: parsed.header.name || slug,
		title: info.zone || parsed.header.name,
		faction,
		classes: hc.class || df.class || null,
		races,
		levels: info.levels || levelsOf(accepted, data) || (String(parsed.header.subgroup || "").match(/\b(\d+-\d+)\b/) || [])[1] || null,
		zone,
		defaultMap,
		sourceSteps: parsed.steps.length,
		steps,
	};
	return render(guide, { report, slug, packId, next: opts.next || [] });
}
