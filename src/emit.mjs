// Parsed RXP guide -> Polestar `.guide` text plus a report of everything that
// was not carried over one to one. Nothing is guessed: an id the data does not
// know is quoted by name or the line becomes a `task`/`note`, and the report
// says so.

import { parseCondition, andOnly, onlyText, CLASSES } from "./cond.mjs";
import { plain, parseName } from "./rxp/parse.mjs";
import { worldToZone, zoneName, findNpc } from "./data.mjs";

const IGNORED = new Set([
	"target", "mob", "unitscan", "itemcount", "isOnQuest", "isQuestTurnedIn", "isQuestComplete", "cooldown", "macro", "timer",
	"skipgossip", "skipgossipid", "zoneskip", "subzone", "subzoneskip", "maxlevel", "disablecheckbox", "is", "item", "addquestitem",
	"bindlocation", "trainer", "dungeon", "itemStat", "zone", "isQuestAvailable",
]);
const TASKS = new Set(["hs", "home", "fp", "deathskip", "abandon", "destroy", "cast", "equip"]);
const PROFESSIONS = new Set(["Mining", "Herbalism", "Skinning", "Alchemy", "Blacksmithing", "Enchanting", "Engineering", "Leatherworking", "Tailoring", "First Aid", "Cooking", "Fishing"]);
const DROP_TAGS = new Set(["hardcore", "ssf", "ah"]);

function bare(text) { return String(text).replace(/"/g, "'"); }
function q(text) { return `"${String(text).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`; }

function copper(goldText) {
	const c = Math.round(parseFloat(goldText) * 10000);
	if (!Number.isFinite(c) || c <= 0) return null;
	const g = Math.floor(c / 10000), s = Math.floor((c % 10000) / 100), k = c % 100;
	return `${g ? g + "g" : ""}${s ? s + "s" : ""}${k ? k + "c" : ""}` || null;
}

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

export class Report {
	constructor() { this.counts = new Map(); this.items = []; }
	count(key, n = 1) { this.counts.set(key, (this.counts.get(key) || 0) + n); }
	note(guide, stepNo, what, line) { this.items.push({ guide, stepNo, what, line }); }
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
	const at = (g) => { if (g && g.uiMap) usedMaps.push(g.uiMap); return g ? ` @${g.x},${g.y}${g.live ? "" : " era"}` : ""; };

	// Pass 2: goals.
	const goals = [];
	const whens = [];
	const tips = [];
	const notes = [];
	let title = null;
	let formatNeeds = 4;
	const add = (text, lineCond, kind) => {
		const lc = parseCondition(lineCond);
		const only = andOnly(cond.only, lc.only);
		const mine = {};
		for (const k of Object.keys(lc.only)) mine[k] = lc.only[k];
		goals.push({ text, only: onlyText(mine), kind });
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
				if (o) { goals.push({ text: `note ${q(t)}`, only: o, kind: "note" }); report.count("class-specific text -> note only"); }
			}
			continue;
		}
		if (l.kind === "note") {
			const t = plain(l.text);
			if (t && !l.cond) notes.push(bare(t));
			else if (t) {
				const o = onlyText(parseCondition(l.cond).only);
				if (o) { goals.push({ text: `note ${q(t)}`, only: o, kind: "note" }); report.count("class-specific text -> note only"); }
			}
			continue;
		}
		const n = l.name;
		const lineQuestId = Number((l.args.match(/^(\d+)/) || [])[1]);
		if (n === "accept" || n === "turnin") {
			const known = data.quests[lineQuestId];
			if (n === "accept") ctx.seen.add(lineQuestId);
			if (known) add(`${n} ${lineQuestId}`, l.cond, n);
			else {
				const title = plain(l.text).replace(/^(accept|turn in)\s+/i, "");
				add(`${n} ${lineQuestId} ${q(title)}${at(placeFor(li))}`, l.cond, n);
				report.note(ctx.name, stepNo, `quest ${lineQuestId} unknown to the data; quoted by name`, l.text);
			}
			if (!title) title = plain(l.text).replace(/^(accept|turn in)\s+/i, "");
		} else if (n === "complete") {
			const m = l.args.match(/^(\d+)(?:,(\d+))?/);
			const quest = data.quests[Number(m[1])];
			if (!quest) { add(`complete ${m[1]} ${q(ctx.titles.get(Number(m[1])) || plain(l.text) || "quest " + m[1])}${at(placeFor(li))}`, l.cond, "complete"); report.note(ctx.name, stepNo, `quest ${m[1]} unknown to the data`, l.args); continue; }
			if (m[2] == null) {
				// A quest without objectives completes by the turn-in; a `complete` would only warn.
				if ((quest.objectives || []).length === 0) { report.count("complete on a quest without objectives (dropped)"); continue; }
				add(`complete ${m[1]}`, l.cond, "complete"); continue;
			}
			const hit = resolveObjective(quest, l.comment || l.text || "", null);
			if (hit && hit.obj.type === "kill") add(`kill ${hit.obj.id} quest ${m[1]}.${hit.index}`, l.cond, "kill");
			else if (hit && hit.obj.type === "item") add(`collect ${hit.obj.id} quest ${m[1]}.${hit.index}`, l.cond, "collect");
			else if (hit && hit.obj.type === "object") add(`interact ${hit.obj.id} quest ${m[1]}.${hit.index}`, l.cond, "interact");
			else { add(`complete ${m[1]}`, l.cond, "complete"); report.note(ctx.name, stepNo, "objective not matched by name; whole quest used", `${l.args} ${l.comment || ""}`); }
		} else if (n === "collect") {
			const [item, count, qid] = l.args.split(",").map((s) => s.trim());
			const itemId = Number(item);
			const known = data.items[itemId];
			const name = known ? "" : ` ${q(plain(l.comment || l.text || "item " + itemId))}`;
			if (buyText) {
				const npc = npcFor("vendor");
				add(`buy ${itemId}${name} x${count || 1} ${npc ? "npc " + npc.id : "nearest"}`, l.cond, "buy");
				if (!npc) report.note(ctx.name, stepNo, "vendor not resolved; `nearest` used", l.comment || "");
			} else if (qid && data.quests[Number(qid)]) {
				const hit = resolveObjective(data.quests[Number(qid)], "", itemId);
				// RXP often collects ahead of the accept; Polestar wants the accept first,
				// so an early pick-up counts the bag instead of the quest objective.
				const early = !ctx.seen.has(Number(qid)) && ctx.accepted.has(Number(qid));
				if (early) { add(`collect ${itemId}${name} x${count || (hit && hit.obj.count) || 1}`, l.cond, "collect"); report.count("collect before accept -> bag count"); }
				else if (hit) add(`collect ${itemId}${name} quest ${qid}.${hit.index}`, l.cond, "collect");
				else add(`collect ${itemId}${name} x${count || 1}`, l.cond, "collect");
			} else add(`collect ${itemId}${name} x${count || 1}`, l.cond, "collect");
		} else if (n === "vendor") {
			const npc = npcFor("vendor");
			add(npc ? `vendor ${npc.id}` : "vendor nearest", l.cond, "vendor");
			if (!npc) report.note(ctx.name, stepNo, "vendor not resolved; `nearest` used", plain(l.text));
		} else if (n === "train") {
			const note = plain(l.text);
			// "Train [Mining]": a profession has its own trainers, not the class trainer.
			const prof = (note.match(/\[([^\]]+)\]/) || [])[1];
			if (prof && PROFESSIONS.has(prof)) {
				const pnpc = npcFor("trainer");
				add(`train ${PROFESSIONS.size && prof.includes(" ") ? q(prof) : prof}${pnpc ? " npc " + pnpc.id : ""}`, l.cond, "train");
				report.count(".train profession -> train <Profession>");
				continue;
			}
			const npc = npcFor("trainer");
			const lineClasses = parseCondition(l.cond).only.class || cond.only.class || CLASSES;
			if (npc) add(`train ${npc.id}${note ? " -- " + note : ""}`, l.cond, "train");
			else {
				// Data gap: Polestar has no Horde Paladin class trainer (lint/playtest say so).
				const rest = lineClasses.filter((c) => c !== "Paladin");
				if (lineClasses.includes("Paladin")) {
					add(`task ${q(note || "Train at your class trainer")}`, "Paladin", "task"); formatNeeds = 5;
					report.count("train (Paladin, no trainer in data) -> task");
				}
				if (rest.length) {
					add(`train class${note ? " -- " + note : ""}`, rest.length < CLASSES.length ? rest.join("/") : null, "train");
					report.note(ctx.name, stepNo, "trainer not resolved; `train class` used", note);
				}
			}
		} else if (n === "use") {
			const id = Number(l.args.split(",")[0]);
			if (data.items[id]) add(`use ${id}`, l.cond, "use");
			else { add(`task ${q(plain(l.text) || "Use item " + id)}`, l.cond, "task"); formatNeeds = 5; }
		} else if (n === "xp") {
			// RXP: ".xp <12,1" skips the step while below level 12 (second number = skip);
			// ".xp 16,1" / ".xp >16,1" skips it from level 16 on; ".xp 3+895" is a grind goal.
			const m = l.args.match(/^([<>]?)\s*(\d+)(?:\+(\d+))?(?:,\s*(-?\d+))?$/);
			if (!m) report.count(".xp (unparsed)");
			else if (m[4] && Number(m[4]) !== 0 && !l.cond) {
				const lv = m[3] ? `${m[2]}+${m[3]}` : m[2];
				whens.push(m[1] === "<" ? `level>=${lv}` : `level<${lv}`);
				report.count(".xp skip form -> when level");
			} else if (!m[4] && m[1] === "" && m[3]) { add(`level ${m[2]}+${m[3]}`, l.cond, "level"); report.count(".xp L+N -> level"); }
			else report.count(".xp (ignored)");
		} else if (n === "skill") {
			const m = l.args.match(/^([a-z]+),\s*(\d+)$/i);
			const NAMES = { firstaid: "First Aid", cooking: "Cooking", fishing: "Fishing", mining: "Mining", herbalism: "Herbalism", skinning: "Skinning" };
			if (m && NAMES[m[1].toLowerCase()]) { add(`skill ${q(NAMES[m[1].toLowerCase()])} ${m[2]}`, l.cond, "skill"); report.count(".skill -> skill"); }
			else report.count(".skill (ignored)");
		} else if (n === "money") {
			// Counting the character's money does not hold up in play (selling junk, repairs):
			// RXP's step is ticked by the player, so the goal is dropped and the text stays.
			report.count(".money (dropped: not a reliable goal)");
		} else if (TASKS.has(n)) {
			const t = plain(l.text) || n;
			if (n === "destroy") { const id = Number(l.args.split(",")[0]); if (data.items[id] && !l.cond) whens.push(`has ${id}`); }
			add(`task ${q(t)}`, l.cond, "task");
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
		for (const g of goals) { g.text = g.text.replace(/^note /, "task "); g.kind = "task"; }
		formatNeeds = 5;
		report.count("instruction-only step -> task");
	}
	const hasPlaced = goals.some((g) => ["accept", "turnin", "vendor", "train", "buy", "kill", "collect", "interact", "complete"].includes(g.kind));
	const placeable = gotos.filter((g) => g.r !== 0 || gotos.length === 1);

	// A step of walking only: RXP's waypoints, nothing to tick.
	if (!goals.length && (completewith || (!notes.length && !gotos.length))) {
		if (gotos.length || tips.length || notes.length) report.count("step: waypoints/text only (dropped)");
		return null;
	}
	if (!goals.length && !notes.length && gotos.length) {
		const g = gotos[gotos.length - 1];
		if (g.uiMap) usedMaps.push(g.uiMap);
		goals.push({ text: `goto ${g.x},${g.y}${g.live ? "" : " era"}${tips[0] ? " " + q(tips[0].slice(0, 40)) : ""}`, only: "", kind: "goto" });
	}

	const allAlong = goals.length > 0 && goals.every((g) => ["kill", "collect", "complete", "buy"].includes(g.kind) && /quest \d+\.\d+|xN|buy|complete/.test(g.text + " buy complete"));
	// A goal the data places (giver, vendor, trainer) sits where RXP's own .goto points.
	if (!usedMaps.length && mapId && goals.some((g) => ["accept", "turnin", "vendor", "train", "buy", "complete"].includes(g.kind))) usedMaps.push(mapId);
	const orphanOf = (g) => {
		const m = g.text.match(/^(?:turnin|complete) (\d+)/) || g.text.match(/ quest (\d+)\./);
		return m && !ctx.accepted.has(Number(m[1])) ? Number(m[1]) : null;
	};
	const orphanGoals = goals.filter((g) => orphanOf(g));
	const base = {
		stepNo, title: title || tips[0] || notes[0] || null, cond, goals, tips, notes, whens, usedMaps, gotos: isLoop ? placeable : [],
		isLoop, completewith: completewith ? completewith.args : null, labelDef, formatNeeds, hasPlaced, allAlong,
	};
	if (!orphanGoals.length) return [base];
	// A quest taken up in an earlier file (or left out of this one): its goals go
	// in their own step that only applies while the quest is in the log.
	const ids = [...new Set(orphanGoals.map(orphanOf))];
	report.count(`goals for quests accepted elsewhere -> when onquest (${orphanGoals.length})`);
	const rest = goals.filter((g) => !orphanOf(g));
	const orphanStep = { ...base, usedMaps: [], goals: orphanGoals, tips: [], notes: [], whens: [...whens, `onquest ${ids.join(",")}`], labelDef: null, completewith: null, isLoop: false, gotos: [] };
	if (!rest.length) return [{ ...orphanStep, tips, notes }];
	return [{ ...base, goals: rest }, orphanStep];
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
	const accepted = opts.accepted || new Set();
	for (const s of parsed.steps) for (const l of s.lines) {
		if (l.kind === "cmd" && l.name === "accept") accepted.add(Number((l.args.match(/^(\d+)/) || [])[1]));
	}
	const ctx = { report, name: parsed.header.name || slug, titles, accepted, seen: opts.seen || new Set() };
	const steps = [];
	parsed.steps.forEach((s, i) => {
		for (const b of buildStep(s, i + 1, data, ctx) || []) steps.push(b);
	});

	// `along until <label>`: only when the label sits on a later step we keep.
	const labels = new Map();
	steps.forEach((s, i) => { if (s.labelDef) labels.set(s.labelDef, i); });
	let format = 4;
	const out = [];
	let defaultMap = null;
	const zone = (() => {
		for (const s of parsed.steps) for (const l of s.lines) if (l.kind === "cmd" && l.name === "goto") {
			const m = l.args.match(/^(\d+)\//);
			if (m) { defaultMap = Number(m[1]); return zoneName(data, defaultMap); }
		}
		return info.zone;
	})();
	// Polestar's `zone` is sticky, but a class-only step's zone does not reach the
	// characters who skipped it, so the next step names its zone again.
	let curMap = defaultMap;
	let conditionalMap = null;
	out.push(`guide ${packId}/${slug}`);
	out.push(`title ${info.zone || parsed.header.name}`);
	const hc = parseCondition(parsed.header.faction).only;
	if (hc.faction) out.push(`faction ${hc.faction[0]}`);
	if (hc.class) out.push(`class ${hc.class.join(", ")}`);
	const df = parseCondition((parsed.header.defaultfor || "").replace(/,/g, " ")).only;
	const classes = hc.class || df.class;
	if (classes && !hc.class) out.push(`class ${classes.join(", ")}`);
	const races = hc.race || df.race || [];
	if (races.length) out.push(`race ${races.join(", ")}`);
	if (info.levels) out.push(`levels ${info.levels}`);
	if (zone) out.push(`zone ${zone}`);
	out.push("coords live");
	if (opts.next) out.push(`next ${packId}/${opts.next}`);
	out.push("category Leveling");
	out.push("");

	steps.forEach((s, i) => {
		format = Math.max(format, s.formatNeeds);
		out.push(`step${s.title ? " " + s.title.slice(0, 60) : ""}`);
		const only = onlyText(s.cond.only);
		if (only) out.push(`  only ${only}`);
		for (const w of s.whens || []) out.push(`  when ${w}`);
		const maps = [...(s.isLoop && s.goals.some((g) => ["kill", "collect", "interact"].includes(g.kind)) ? s.gotos.map((g) => g.uiMap) : []), ...(s.usedMaps || [])].filter(Boolean);
		if (maps.length) {
			const m = maps[0];
			const conditional = !!only || (s.whens || []).length > 0;
			if (m !== curMap || (conditionalMap !== null && conditionalMap !== m)) {
				out.push(`  zone map ${m}`);
				report.count("zone map set");
			}
			if (conditional) conditionalMap = m;
			else { curMap = m; conditionalMap = null; }
		}
		let along = false;
		if (s.completewith && s.allAlong) {
			if (s.completewith === "next") { out.push("  along"); along = true; }
			else if (labels.has(s.completewith) && labels.get(s.completewith) > i) { out.push(`  along until ${s.completewith}`); along = true; format = Math.max(format, 4); }
		}
		if (s.labelDef && steps.some((o, j) => j < i && o.completewith === s.labelDef && o.allAlong)) out.push(`  label ${s.labelDef}`);
		for (const t of s.tips.slice(0, 2)) if (t !== s.title) out.push(`  tip ${t}`);
		const loopable = s.goals.some((g) => ["kill", "collect", "interact"].includes(g.kind) && !/ @/.test(g.text));
		if (s.isLoop && s.gotos.length >= 2 && loopable) { out.push("  loop"); for (const g of s.gotos) out.push(`  goto ${g.x},${g.y}${g.live ? "" : " era"}`); }
		const optional = s.completewith && !along && !s.goals.every((g) => ["money", "note"].includes(g.kind));
		for (const g of s.goals) {
			let line = `  ${g.text}`;
			// a `-- note` stays last on the line
			const dash = line.indexOf(" -- ");
			let tail = "";
			if (dash >= 0) { tail = line.slice(dash); line = line.slice(0, dash); }
			if (g.only) line += ` only ${g.only}`;
			if (optional && !["note", "task"].includes(g.kind)) line += " optional";
			out.push(line + tail);
		}
		for (const n of s.notes.slice(0, 2)) out.push(`  note ${n}`);
		out.push("");
	});
	report.count("steps in: " + parsed.steps.length, 0);
	return { text: out.join("\n"), format, stepsIn: parsed.steps.length, stepsOut: steps.length };
}
