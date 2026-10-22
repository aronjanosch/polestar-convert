// Parsed RXP guide -> the intermediate form (src/ir.mjs) plus a report of
// everything that was not carried over one to one. Nothing is guessed: an id the
// data does not know is quoted by name or the line becomes a `task`/`note`, and
// the report says so.

import { parseCondition, onlyText, condsMeet, onlyMeet, CLASSES } from "../cond.mjs";
import { plain, parseName } from "./parse.mjs";
import { baseItemSoldBy, goalPlaced, worldToZone, zoneName, zoneIdNamed, findNpc, questOpenTo, questEndPlaced, journalPlace, eliteOf, innNamed, flightNamed } from "../data.mjs";
import { render, shorten } from "../emit.mjs";
import { bare, questOf } from "../ir.mjs";
import { resolveObjective } from "../objective.mjs";

const IGNORED = new Set([
	"target", "mob", "unitscan", "itemcount", "macro", "timer",
	"skipgossip", "skipgossipid", "subzone", "disablecheckbox", "is", "item", "addquestitem",
	"itemStat", "zone", "link", "line", "solo", "enabledungeon",
]);
const TASKS = new Set(["hs", "home", "fp", "fly", "deathskip", "abandon", "destroy", "cast", "equip", "bankdeposit", "bankwithdraw"]);
// A label as Polestar takes it: letters, digits, `-` and `_`.
const labelOf = (text) => String(text || "").trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || null;
// RXP's quest conditions on a step -> Polestar's `when` predicate and its `!`.
// RXP skips the step unless one of the quests named holds.
const WHEN_OF = {
	isOnQuest: ["onquest", false], isNotOnQuest: ["onquest", true],
	isQuestTurnedIn: ["turnedin", false], isQuestComplete: ["complete", false],
	isQuestNotComplete: ["complete", true], isQuestAvailable: ["available", false],
};
// Goals Polestar checks off in an `along` step (not tasks, gotos or visits). Not
// accepts or hand-ins: the route passes an along step at once, and a quest not
// taken then would hold its later goals.
const ALONG_KINDS = new Set(["kill", "collect", "complete", "buy", "note"]);
const PLACE_KINDS = new Set(["kill", "collect", "interact", "use", "complete"]);
const GROUP_KINDS = new Set(["accept", "turnin", "complete", "kill", "collect", "interact", "use"]);
// Every rank's spell of each profession, by id; Anti-Venom is a First Aid recipe.
const PROFESSION_SPELLS = {};
for (const [prof, ids] of Object.entries({
	"Alchemy": [2259, 3101, 3464, 11611], "Blacksmithing": [2018, 3100, 3538, 9785], "Enchanting": [7411, 7412, 7413, 13920],
	"Engineering": [4036, 4037, 4038, 12656], "Herbalism": [2366, 2368, 3570, 11993], "Leatherworking": [2108, 3104, 3811, 10662],
	"Mining": [2575, 2576, 3564, 10248], "Skinning": [8613, 8617, 8618, 10768], "Tailoring": [3908, 3909, 3910, 12180],
	"First Aid": [3273, 3274, 7924, 10846, 7934, 7928, 7929, 10840, 10841, 18629, 18630, 3275, 3276, 3277, 3278],
	"Cooking": [2550, 3102, 3413, 18260], "Fishing": [7620, 7731, 7732, 18248],
})) for (const id of ids) PROFESSION_SPELLS[id] = prof;
const PROFESSION_BASE = new Set([2259, 2018, 7411, 4036, 2366, 2108, 2575, 8613, 3908, 3273, 2550, 7620]);
const PROFESSIONS = new Set(["Mining", "Herbalism", "Skinning", "Alchemy", "Blacksmithing", "Enchanting", "Engineering", "Leatherworking", "Tailoring", "First Aid", "Cooking", "Fishing"]);
// RXP's variant tags: `#hardcore` steps only in hardcore mode; `#ssf` (buy at a
// vendor) or `#ah` (look at the auction house) by RXP's self-found setting, off
// by default, as here unless `selfFound`.
const dropTags = (selfFound) => new Set(["hardcore", "hardcoreserver", "som", selfFound ? "ah" : "ssf"]);
// RXP's client variants as it reads them on Forever: season 0, phase 6, XP rate 1.
function variantShown(tag) {
	const arg = String(tag.args || "").replace(/<<.*$/, "").trim();
	if (tag.name === "season") return arg.split(/[,;\s]+/).map(Number).includes(0);
	if (tag.name === "phase") {
		const m = arg.match(/^(\d+)(?:-(\d+))?$/);
		return !m || (6 >= Number(m[1]) && (m[2] == null || 6 <= Number(m[2])));
	}
	if (tag.name === "xprate") {
		const m = arg.match(/^([<>]?)\s*(\d+\.?\d*)(?:-(\d+\.?\d*))?/);
		if (!m) return true;
		const a = Number(m[2]);
		if (m[1] === "<") return 1 < a;
		if (m[1] === ">") return 1 > a;
		return m[3] == null ? true : a <= 1 && 1 <= Number(m[3]);
	}
	return true;
}
// RXP's dungeon tags (DB/forever/db.lua) -> the dungeon as Polestar names it.
const DUNGEONS = {
	RFC: "Ragefire Chasm", DM: "Deadmines", DEADMINES: "Deadmines", VC: "Deadmines", WC: "Wailing Caverns", SFK: "Shadowfang Keep",
	BFD: "Blackfathom Deeps", STOCKS: "Stormwind Stockade", STOCKADES: "Stormwind Stockade", GNOMER: "Gnomeregan", RFK: "Razorfen Kraul",
	SM: "Scarlet Monastery", RFD: "Razorfen Downs", ULDA: "Uldaman", ZF: "Zul'Farrak", MARA: "Maraudon", ST: "Sunken Temple",
	BRD: "Blackrock Depths", DME: "Dire Maul", DMW: "Dire Maul", DMN: "Dire Maul", SCHOLO: "Scholomance", STRAT: "Stratholme",
	LBRS: "Blackrock Spire", HOT: "The Hall of Thanes", ROL: "Ruins of Lordaeron", ES: "Excavation Site: Wetlands", COD: "City of Dalaran",
};


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
		return { uiMap, x: z.x, y: z.y, live: z.live, r: parts[3] != null ? parseFloat(parts[3]) : null, noArrow: parts[3] === "0" || parts[4] === "0" };
	}
	// Zone percentages on the map RXP names, in the Era frame RXP writes them in.
	return { uiMap: zoneIdNamed(data, mapPart), x, y, live: false, r: parts[3] != null ? parseFloat(parts[3]) : null, noArrow: parts[3] === "0" || parts[4] === "0", zoneText: mapPart };
}

// `.abandon <quest>`, `.destroy <item>[,count]`, `.cast <spell>` and `.usespell <spell>`
// as Polestar goals (pack format 5), or null when Polestar cannot check it: a quest or
// item not in its data, a spell no RXP line names (the caller then falls back to a task).
// RXP's `.cast a,b` is done by any of the spells; Polestar's `cast` takes one, the first.
function nativeGoal(n, l, data, spells) {
	const id = Number(String(l.args).split(",")[0]);
	if (!(id > 0)) return null;
	if (n === "abandon" && data.quests && data.quests[id]) return { kind: "abandon", quest: id };
	if (n === "destroy" && data.items && data.items[id]) return { kind: "destroy", item: id };
	// `.usespell` is a button beside the step in RXP, done or not: it never holds the step.
	if ((n === "cast" || n === "usespell") && spells.has(id)) return { kind: "cast", spell: id, name: spells.get(id), optional: n === "usespell" || undefined };
	return null;
}

// A spell's name from RXP's lines that cast it: the `[Name]` of its icon link, or
// "Cast <Name>". Polestar wants the name for a spell that is not a recipe.
export function spellNames(guides) {
	const names = new Map();
	for (const g of guides) for (const s of g.steps) for (const l of s.lines) {
		if (l.kind !== "cmd" || (l.name !== "cast" && l.name !== "usespell") || !/^\d+$/.test(l.args.trim())) continue;
		const id = Number(l.args.trim());
		const raw = l.text || "";
		const name = (raw.match(/\|t\[([^\]]+)\]/) || [])[1] || (plain(raw).match(/^Cast ([^.(]+?)\.?$/i) || [])[1];
		if (name && plain(name) && !names.has(id)) names.set(id, plain(name));
	}
	return names;
}

// RXP's `.skill <profession>,<N>,1` skips the step from rank N on (`<N`: below N): the
// step is Polestar's `when !skill <Profession> N` (`when skill`). Riding is no profession
// in Polestar. null when the line is not that form.
const SKILLS = { firstaid: "First Aid", cooking: "Cooking", fishing: "Fishing", mining: "Mining", herbalism: "Herbalism", skinning: "Skinning", alchemy: "Alchemy", blacksmithing: "Blacksmithing", enchanting: "Enchanting", engineering: "Engineering", leatherworking: "Leatherworking", tailoring: "Tailoring" };
export function skillWhen(args) {
	const m = String(args).replace(/\s/g, "").match(/^([a-z]+),(<?)(\d+),(\d+)/i);
	const name = m && SKILLS[m[1].toLowerCase()];
	if (!name || Number(m[4]) === 0 || Number(m[3]) < 1) return null;
	return `${m[2] ? "" : "!"}skill ${name.includes(" ") ? JSON.stringify(name) : name} ${m[3]}`;
}

// RXP's `.cooldown item|spell,<id>,>N` skips the step while more than N seconds of
// cooldown are left (at least 2), `<N` while fewer: with N up to 2, Polestar's
// `when !cooldown` / `when cooldown`. A longer threshold has no Polestar form: null.
export function cooldownWhen(args) {
	const m = String(args).replace(/\s/g, "").match(/^(item|spell),(\d+),([<>]?)(\d+(?:\.\d+)?)(m?)/);
	if (!m || Number(m[4]) * (m[5] ? 60 : 1) > 2) return null;
	return `${m[3] === "<" ? "" : "!"}cooldown ${m[1]} ${m[2]}`;
}

// RXP's `.money <N` / `>N` (gold) -> the `when money` that shows the step, or null.
export function moneyWhen(args) {
	const m = String(args).replace(/\s/g, "").match(/^([<>])(\d+(?:\.\d+)?)/);
	if (!m) return null;
	const copper = Math.round(Number(m[2]) * 1e4);
	return m[1] === "<" ? `money>=${copper}` : `money<${copper}`;
}

// The one item a ".vendor <id> >> Buy ..." line buys, or null: the step's `.collect`,
// else the one bracketed name the data knows as sold by that NPC.
function boughtItem(step, line, npc, data) {
	const sold = (id) => data.items[id] && (data.items[id].vendors || []).includes(npc.id);
	for (const c of step.lines) {
		if (c.kind !== "cmd" || c.name !== "collect" || !condsMeet(c.cond, line.cond)) continue;
		const [id, count] = c.args.split(",").map(Number);
		if (sold(id)) return { id, count: count || 1, line: step.lines.indexOf(c) };
	}
	const names = [...(line.text || "").matchAll(/\[(?:\|c[0-9A-Fa-f]{8})?([^\]|]+?)(?:\|r)?\]/g)].map((m) => m[1].toLowerCase());
	if (names.length !== 1) return null;
	const hits = Object.values(data.items).filter((it) => it.name && it.name.toLowerCase() === names[0] && sold(it.id));
	return hits.length === 1 ? { id: hits[0].id, count: 1 } : null;
}

// A condition RXP never meets (`skip`, `sod`): the step is switched off. One that is no
// product of class x race x faction splits into one step per disjoint product, unless
// the step is a label's target (the copies would share it).
// Questie encodes "listen to X", "heal X", "escort X" as a kill objective on a friendly
// NPC. The quest log counts it, so the goal stays a `kill ... quest Q.O`, but the player
// must not read "Kill <friendly>": its text is what RXP writes, else "Talk to <name>".
// A fight with a friendly (the quest says defeat, beat, subdue) stays a kill. Polestar's
// own test of friendly: the NPC's side, or both.
const TALK_WORDS = /^(talk|speak|listen|heal|escort|find|show|lead|keep|defend|view|check|observe|perform|wait|follow|watch|help|protect|free|use|wake|resurrect|give|ask|take|rescue)\b/i;
const FIGHT_WORDS = /\b(kill|slay|defeat|beat|subdue|face)\b/i;
export function friendlyKillText(obj, quest, faction, l, data) {
	const npc = data.npcs && data.npcs[obj.id];
	if (!npc || !(npc.faction === "AH" || (faction && npc.faction === faction[0]))) return undefined;
	if (FIGHT_WORDS.test(quest.objectiveText || "")) return undefined;
	const said = plain(l.text || l.comment || "").replace(/^\|?\d+\/\d+\s*/, "").replace(/\s*\(\d+\)$/, "").trim();
	if (TALK_WORDS.test(said)) return said;
	if ((obj.count || 1) > 1) return said || undefined;
	if (!npc.name) return undefined;
	return `${/^find\b/i.test(quest.objectiveText || "") ? "Find" : "Talk to"} ${npc.name}`;
}

function buildStep(step, stepNo, data, ctx) {
	const { report } = ctx;
	const cond = parseCondition(step.cond, ctx.scope);
	cond.unknown.forEach((u) => report.note(ctx.name, stepNo, `unknown condition word "${u}"`, step.cond));
	if (cond.never) {
		report.count(cond.anywhere ? "step: for characters the guide is not for (dropped)" : "step: condition true for nobody (dropped)");
		if (!cond.anywhere) report.note(ctx.name, stepNo, "step dropped: its condition is true for nobody", step.cond);
		return null;
	}
	const labelled = step.tags.some((t) => t.name === "label");
	if (cond.inexact && cond.groups.length > 1 && !labelled) {
		report.count(`step: condition split into ${cond.groups.length} steps`);
		return cond.groups.flatMap((only) => buildOne(step, stepNo, data, ctx, { ...cond, only }) || []);
	}
	if (cond.inexact) {
		report.count("inexact condition");
		report.note(ctx.name, stepNo, "inexact condition (step shown to a few more characters)", step.cond);
	}
	return buildOne(step, stepNo, data, ctx, cond);
}

function buildOne(step, stepNo, data, ctx, cond) {
	const { report } = ctx;
	// A race the guide is not for never shows the step.
	if (ctx.races.length && cond.only.race && !cond.only.race.some((r) => ctx.races.includes(r))) { report.count("step: for races the guide is not for (dropped)"); return null; }
	// Lines whose condition nobody meets, or no one who gets this step: gone, as in RXP.
	const lines = [];
	for (const l of step.lines) {
		if (l.cond) {
			const lc = parseCondition(l.cond, ctx.scope);
			lc.unknown.forEach((u) => report.note(ctx.name, stepNo, `unknown condition word "${u}"`, l.cond));
			if (lc.never) {
				report.count(lc.anywhere ? "line: for characters the guide is not for (dropped)" : "line: condition true for nobody (dropped)");
				continue;
			}
			if (!lc.groups.some((g) => onlyMeet(g, cond.only))) { report.count("line: condition excludes the step's characters (dropped)"); continue; }
		}
		lines.push(l);
	}
	step = { ...step, lines };

	for (const t of step.tags) {
		if (ctx.drop.has(t.name) || !variantShown(t)) { report.count(`step: #${t.name} variant (dropped)`); return null; }
	}
	const tag = (n) => step.tags.find((t) => t.name === n);
	const completewith = tag("completewith");
	const isLoop = !!tag("loop");
	const sticky = !!tag("sticky");
	const optionalStep = !!tag("optional");
	const labelDef = tag("label") ? labelOf(tag("label").args) : null;
	for (const t of step.tags) {
		if (!["completewith", "label", "loop", "softcore", "optional", "sticky", "season", "phase", "xprate", "era", "era/som", "softcoreserver", "ah", "ssf"].includes(t.name)) report.count(`tag #${t.name} (ignored)`);
	}

	// Pass 1: places, names.
	const gotos = [];
	const targets = [];
	let buyText = false;
	const friendly = [];
	for (const [li, l] of step.lines.entries()) {
		if (l.kind === "cmd" && (l.name === "goto" || l.name === "waypoint")) {
			const g = parseGoto(l.args, data, ctx);
			if (g) { g.cond = l.cond; gotos.push(g); }
		} else if (l.kind === "cmd" && l.name === "target") {
			// "Name::id" names the NPC by id; the id may be one the data lacks (Skyborne), then the name decides.
			const [, name, id] = l.args.replace(/^\+/, "").trim().match(/^(.*?)(?:::(\d+))?$/);
			targets.push({ name: name.trim(), id: id ? Number(id) : null, cond: l.cond, idx: li });
		}
		for (const m of (l.text || "").matchAll(/\|cRXP_FRIENDLY_([^|]+)\|r/g)) friendly.push({ name: m[1].replace(/::\d+$/, "").trim(), cond: l.cond, idx: li });
		if ((l.text || "").includes("RXP_BUY")) buyText = true;
	}
	const mapId = (gotos.find((g) => g.uiMap) || {}).uiMap || null;
	// The guide's last place before this step: where the player stands when nothing better is known.
	const prevPlace = ctx.lastPlace;
	ctx.lastPlace = [...gotos].reverse().find((g) => g.uiMap) || prevPlace;
	// preAll: every one done; else pre: one of them. Only accepts written earlier
	// in this guide count, and not optional ones: a player may start the guide
	// straight from the menu, and a chain is as firm as its first quest.
	const taken = (p) => ctx.ownSeen.has(p) && !ctx.loose.has(p);
	const preTaken = (quest) => {
		const all = quest.preAll || [];
		if (all.length) return all.every(taken);
		const any = quest.pre || [];
		return !any.length || any.some(taken);
	};
	const firstPt = gotos.length ? gotos[gotos.length - 1] : null;
	// Only the targets the line's own condition can meet: "Talk to Frang << Warrior",
	// "Talk to Shikrik << Shaman" in one step are two trainers, one per class.
	// opt.idx: the line's place in the step, to pair it with the target beside it when several fit.
	// opt.item: a buy; a named NPC the item's vendor list holds counts as a vendor, role or not.
	// opt.names: also the NPCs the step's text names ("Talk to |cRXP_FRIENDLY_Joshua|r").
	const npcFor = (role, lineCond = null, opt = {}) => {
		const sells = (n) => opt.item != null && (((data.items[opt.item] || {}).vendors) || []).includes(n.id);
		const cands = [];
		const push = (npc, idx, named) => { if (npc && !cands.some((c) => c.npc === npc)) cands.push({ npc, idx, named }); };
		for (const { name, id, cond: tcond, idx } of targets) {
			if (!condsMeet(tcond, lineCond)) continue;
			push((id && data.npcs[id]) || findNpc(data, name, mapId, firstPt).npc, idx);
		}
		if (opt.names) for (const { name, cond: tcond, idx } of friendly) {
			if (!condsMeet(tcond, lineCond)) continue;
			let npc = findNpc(data, name, mapId, firstPt).npc;
			// RXP names a vendor by first name ("Oliver" for Oliver Dwor): the one here who sells the item.
			if (opt.item != null && !(npc && sells(npc))) {
				const first = name.toLowerCase() + " ";
				const hits = [];
				for (const [key, list] of data.npcByName) if (key.startsWith(first)) hits.push(...list);
				const here = hits.filter((n) => ((data.items[opt.item] || {}).vendors || []).includes(n.id) && (!mapId || (n.spawns || {})[mapId]));
				if (here.length === 1) npc = here[0];
			}
			push(npc, idx, true);
		}
		let pool = cands.filter((c) => (c.npc.roles || []).includes(role) || sells(c.npc));
		if (opt.item != null && pool.some((c) => sells(c.npc))) pool = pool.filter((c) => sells(c.npc));
		// Only a vendor may be taken without its role (the data lists few of them); a trainer never.
		if (!pool.length && role === "vendor" && cands.length === 1 && !cands[0].named) pool = cands;
		if (pool.length < 2) return pool.length ? pool[0].npc : null;
		// Several fit: the one the line's own text names, else the target RXP wrote beside it
		// (after the line, before the next of its kind; else before it), else the line's turn.
		const text = (opt.text || "").toLowerCase();
		const said = pool.filter((c) => text.includes(c.npc.name.toLowerCase())).sort((a, b) => text.indexOf(a.npc.name.toLowerCase()) - text.indexOf(b.npc.name.toLowerCase()));
		if (said.length) return said[0].npc;
		if (opt.idx == null) return pool[0].npc;
		const same = step.lines.map((x, i) => (x.kind === "cmd" && (opt.kinds || []).includes(x.name) ? i : -1)).filter((i) => i >= 0);
		const prev = Math.max(-1, ...same.filter((i) => i < opt.idx));
		const next = Math.min(Infinity, ...same.filter((i) => i > opt.idx));
		const after = pool.filter((c) => c.idx > opt.idx && c.idx < next).sort((a, b) => a.idx - b.idx);
		if (after.length) return after[0].npc;
		const before = pool.filter((c) => c.idx < opt.idx && c.idx > prev).sort((a, b) => b.idx - a.idx);
		if (before.length) return before[0].npc;
		return pool[Math.min(Math.max(same.indexOf(opt.idx), 0), pool.length - 1)].npc;
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
		if (!first && prevPlace) report.note(ctx.name, stepNo, "place taken from the guide's last .goto before this step (check)", step.lines[lineIdx].args);
		return first || prevPlace || null;
	};
	// The item a `.collect` or `.use` before the line in this step names, or null.
	const starterItem = (lineIdx) => {
		for (let i = lineIdx - 1; i >= 0; i--) {
			const c = step.lines[i];
			if (c.kind === "cmd" && (c.name === "collect" || c.name === "use")) {
				const id = Number(String(c.args).split(",")[0]);
				if (data.items[id]) return id;
			}
		}
		return null;
	};
	// The flight point a `.fp` or `.fly` line names: its argument, else what its text says
	// ("Get the Crossroads flight path", "Fly to Redridge Mountains").
	const flightOf = (l) => {
		const named = (t) => flightNamed(data, t, ctx.faction, firstPt);
		const text = plain(l.text);
		return named(String(l.args || "").trim()) || named((text.match(/Get the (.+?) flight path/i) || [])[1]) || named((text.match(/^Fly to (.+?)\.?$/i) || [])[1]);
	};
	const usedMaps = [];
	const at = (g) => { if (g && g.uiMap) usedMaps.push(g.uiMap); return g ? { x: g.x, y: g.y, live: g.live } : undefined; };

	// Pass 2: goals.
	const goals = [];
	const whens = [];
	const tips = [];
	const eliteTips = [];
	// RXP's text lines belong to the command lines after them: the tips each goal brings.
	const ownTips = new Map();
	const ownElite = new Map();
	const goalTitle = new Map();
	let pendingTips = [];
	let titleGoal = null;
	const notes = [];
	let title = null;
	let formatNeeds = 4;
	let closed = 0;
	let group = null;
	let groupForSome = false;
	let enterZone = null;
	let info = false;
	// The `only` of each disjoint product a line's condition is, those the step reaches.
	const groupsOf = (lineCond) => parseCondition(lineCond, ctx.scope).groups.filter((g) => onlyMeet(g, cond.only));
	let negLine = false;
	const negGoals = new Set();
	const add = (goal, lineCond) => {
		for (const mine of groupsOf(lineCond)) addFor(goal, mine);
	};
	const addFor = (goal, mine) => {
		const quest = goal.quest != null ? data.quests[goal.quest] : null;
		const races = mine.race || cond.only.race || (ctx.races.length ? ctx.races : null);
		if (goal.kind !== "accept" && ctx.races.length && mine.race && !mine.race.some((r) => ctx.races.includes(r))) { report.count("goal for races the guide is not for (dropped)"); return; }
		if (quest &&!questOpenTo(data, quest, ctx.faction, races)) {
			closed++;
			report.count("goal for a quest the data closes to these races (dropped)");
			report.note(ctx.name, stepNo, `quest ${goal.quest} (${quest.title}) is not open to ${ctx.faction || "these"} races in the data; ${goal.kind} left out`);
			return;
		}
		// A quest whose prerequisites this guide does not take before: the game may
		// not offer it, so its later goals wait for it (when onquest).
		if (quest && goal.kind === "accept" && !preTaken(quest)) {
			ctx.loose.add(goal.quest);
			report.count("accept whose prerequisite the guide never takes -> later goals wait for the quest");
		}
		// Where the data knows no place for it, the arrow points where RXP sends the player.
		const here = firstPt && firstPt.uiMap ? firstPt : prevPlace;
		if (PLACE_KINDS.has(goal.kind) && !goal.at && !isLoop && here && !goalPlaced(data, goal)) {
			goal = { ...goal, at: at(here) };
			report.count(`${goal.kind} without a place in the data -> RXP's goto`);
		}
		const elite = eliteOf(data, goal);
		if (elite) {
			const tip = `${elite} is elite: grouping up is advised.`;
			if (!eliteTips.includes(tip)) eliteTips.push(tip);
			report.count(`${goal.kind} of elite work -> optional`);
		}
		goals.push({ ...goal, only: onlyText(mine), optional: elite || optionalStep || goal.optional || negLine ? true : undefined });
		ownTips.set(goals[goals.length - 1], pendingTips);
		if (negLine) negGoals.add(goals[goals.length - 1]);
		if (elite) ownElite.set(goals[goals.length - 1], `${elite} is elite: grouping up is advised.`);
		pendingTips = [];
		// After the guide drops a quest, its later goals wait for it to be taken again.
		if (goal.kind === "abandon") { ctx.maybeTaken.add(goal.quest); ctx.surelyTaken.delete(goal.quest); }
	};

	const consumed = new Set();
	for (let li = 0; li < step.lines.length; li++) {
		if (consumed.has(li)) continue;
		const l = step.lines[li];
		if (l.kind === "text") {
			const t = plain(l.text);
			if (!t) continue;
			if ((l.text || "").includes("chatbubble")) continue; // "Talk to X": accept/turnin say it
			if (!l.cond) { tips.push(bare(t)); pendingTips.push(bare(t)); }
			else {
				for (const g of groupsOf(l.cond)) {
					const o = onlyText(g);
					if (o) { goals.push({ kind: "note", text: t, only: o }); report.count("class-specific text -> note only"); }
				}
			}
			continue;
		}
		if (l.kind === "note") {
			const t = plain(l.text);
			// "+1" only keeps a hidden step from being empty in RXP; it says nothing.
			if (/^\d*$/.test(t)) { report.count("+N placeholder line (dropped)"); continue; }
			if (t && !l.cond) notes.push(bare(t));
			else if (t) {
				for (const g of groupsOf(l.cond)) {
					const o = onlyText(g);
					if (o) { goals.push({ kind: "note", text: t, only: o }); report.count("class-specific text -> note only"); }
				}
			}
			continue;
		}
		const n = l.name;
		// RXP's `.turnin -214`: the line is skipped while the quest is not in the log
		// (`skipIfMissing`), so it never holds the step: its goals are optional.
		negLine = /^-\d/.test(l.args);
		const lineQuestId = Number((l.args.match(/^-?(\d+)/) || [])[1]);
		if ((n === "accept" || n === "turnin") && !lineQuestId) { report.count(`.${n} (no quest id, ignored)`); continue; }
		if (n === "accept" || n === "turnin") {
			const goalsBefore = goals.length;
			const known = data.quests[lineQuestId];
			if (n === "accept") { ctx.seen.add(lineQuestId); ctx.ownSeen.add(lineQuestId); }
			if (known && questEndPlaced(data, n === "accept" ? known.start : known.end)) add({ kind: n, quest: lineQuestId }, l.cond);
			else if (known && n === "accept" && starterItem(li)) {
				// Started from an item the step picks up or uses first.
				add({ kind: n, quest: lineQuestId, item: starterItem(li) }, l.cond);
				report.count("accept: started by the item before it in the step");
			} else if (known) {
				// The giver is somewhere the data has no spawn (inside a dungeon): RXP's own
				// place, else the codex's (the dungeon's entrance for a giver inside).
				const place = placeFor(li);
				const listed = place ? null : journalPlace(data, lineQuestId, n === "accept" ? "start" : "finish");
				add({ kind: n, quest: lineQuestId, at: place ? at(place) : listed || undefined }, l.cond);
				report.count(place ? `${n}: giver without a spawn, placed at RXP's goto` : listed ? `${n}: giver without a spawn, placed by the codex` : `${n}: giver without a spawn, no place`);
			} else {
				const title = plain(l.text).replace(/^(accept|turn in)\s+/i, "");
				add({ kind: n, quest: lineQuestId, title, at: at(placeFor(li)) }, l.cond);
				report.note(ctx.name, stepNo, `quest ${lineQuestId} unknown to the data; quoted by name`, l.text);
			}
			const said = plain(l.text).replace(/^(accept|turn in)\s+/i, "");
			if (goals.length > goalsBefore) goalTitle.set(goals[goals.length - 1], said);
			if (!title) { title = said; titleGoal = goals[goals.length - 1]; }
		} else if (n === "complete") {
			const m = l.args.match(/^-?(\d+)(?:,(\d+))?/);
			if (!m) { report.count(".complete (unparsed, ignored)"); report.note(ctx.name, stepNo, "unparsed .complete", l.args); continue; }
			const quest = data.quests[Number(m[1])];
			if (!quest) { add({ kind: "complete", quest: Number(m[1]), title: ctx.titles.get(Number(m[1])) || plain(l.text) || "quest " + m[1], at: at(placeFor(li)) }, l.cond); report.note(ctx.name, stepNo, `quest ${m[1]} unknown to the data`, l.args); continue; }
			if (m[2] == null) {
				// A quest without objectives completes by the turn-in; a `complete` would only warn.
				if ((quest.objectives || []).length === 0) { report.count("complete on a quest without objectives (dropped)"); continue; }
				add({ kind: "complete", quest: Number(m[1]) }, l.cond); continue;
			}
			const hit = resolveObjective(quest, l.comment || l.text || "", null, { index: Number(m[2]) });
			if (hit && hit.obj.type === "kill") add({ kind: "kill", npc: hit.obj.id, quest: Number(m[1]), oi: hit.index, text: friendlyKillText(hit.obj, quest, ctx.faction, l, data) }, l.cond);
			else if (hit && hit.obj.type === "item") add({ kind: "collect", item: hit.obj.id, quest: Number(m[1]), oi: hit.index }, l.cond);
			else if (hit && hit.obj.type === "object") add({ kind: "interact", object: hit.obj.id, quest: Number(m[1]), oi: hit.index }, l.cond);
			else { add({ kind: "complete", quest: Number(m[1]) }, l.cond); report.count("objective not matched by name; whole quest used"); report.note(ctx.name, stepNo, "objective not matched by name; whole quest used", `${l.args} ${l.comment || ""}`); }
		} else if (n === "collect") {
			const [item, count, qid] = l.args.split(",").map((s) => s.trim());
			const itemId = Number(item);
			const known = data.items[itemId];
			const itemName = known ? undefined : plain(l.comment || l.text || "item " + itemId);
			if (buyText && !npcFor("vendor", l.cond) && !((known || {}).vendors || []).length) {
				// No vendor sells it: bought at the auction house, so the bag counts.
				add({ kind: "collect", item: itemId, itemName, count: count || 1 }, l.cond);
				report.count("buy without a vendor (auction house) -> collect");
			} else if (buyText) {
				const npc = npcFor("vendor", l.cond, { item: itemId, names: true, idx: li, kinds: ["collect"], text: l.comment || l.text });
				const base = npc && baseItemSoldBy(data, itemId, npc.id);
				if (base) report.count("buy of a made item -> buy of the item it is made from");
				add({ kind: "buy", item: base || itemId, itemName: base ? undefined : itemName, count: count || 1, npc: npc ? npc.id : undefined }, l.cond);
				if (!npc) report.note(ctx.name, stepNo, "vendor not resolved; `nearest` used", l.comment || "");
			} else if (qid && data.quests[Number(qid)]) {
				const hit = resolveObjective(data.quests[Number(qid)], "", itemId, { strictItem: true });
				// RXP often collects ahead of the accept; Polestar wants the accept first,
				// so an early pick-up counts the bag instead of the quest objective.
				const early = !ctx.seen.has(Number(qid)) && ctx.accepted.has(Number(qid));
				// The quest taken later in this step, or by no guide here (an item bought ahead
				// at the auction house, cooking material): the bags count, there is no quest to wait for.
				const takenLater = step.lines.slice(li + 1).some((c) => c.kind === "cmd" && c.name === "accept" && Number((c.args.match(/^-?(\d+)/) || [])[1]) === Number(qid));
				if (takenLater || !ctx.accepted.has(Number(qid))) {
					add({ kind: "collect", item: itemId, itemName, count: count || (hit && hit.obj.count) || 1 }, l.cond);
					report.count(takenLater ? "collect before accept in the step -> bag count" : "collect for a quest no guide takes -> bag count");
				} else if (early) { add({ kind: "collect", item: itemId, itemName, count: count || (hit && hit.obj.count) || 1 }, l.cond); report.count("collect before accept -> bag count"); }
				else if (hit) add({ kind: "collect", item: itemId, itemName, quest: Number(qid), oi: hit.index }, l.cond);
				else add({ kind: "collect", item: itemId, itemName, count: count || 1 }, l.cond);
			} else add({ kind: "collect", item: itemId, itemName, count: count || 1 }, l.cond);
		} else if (n === "vendor") {
			// ".vendor <id>" names the NPC itself.
			const said = /^\d+$/.test(l.args.trim()) ? data.npcs[Number(l.args)] : null;
			const npc = said || npcFor("vendor", l.cond);
			const text = plain(l.text);
			// "Buy [Dirk]" under .vendor: one item the data knows is a buy, not a junk sale.
			const buyItem = npc && /\bbuy\b/i.test(text) ? boughtItem(step, l, npc, data) : null;
			if (buyItem && buyItem.line != null && (buyItem.line < li || (step.lines[buyItem.line].cond || "") !== (l.cond || ""))) {
				// The step's own .collect, written before or for other classes, already is the buy (or the bag count).
				report.count(".vendor <id> with a buy text, the .collect before it covers it (dropped)");
			} else if (buyItem) {
				// A .collect of the item after it would only repeat the buy.
				if (buyItem.line != null) consumed.add(buyItem.line);
				add({ kind: "buy", item: buyItem.id, count: buyItem.count, npc: npc.id }, l.cond);
				report.count(".vendor <id> with a buy text -> buy");
			} else {
				add({ kind: "vendor", npc: npc ? npc.id : undefined, comment: npc ? undefined : text || undefined }, l.cond);
				if (!npc) report.note(ctx.name, stepNo, "vendor not resolved; `nearest` used", text);
			}
		} else if (n === "train" || n === "trainer") {
			const note = plain(l.text);
			const opt = { idx: li, kinds: ["train", "trainer"], text: note };
			// Spells the pet learns by fighting, not at a trainer.
			if (n === "train" && /\b(attack mobs with it to learn|tame beast)\b/i.test(note)) {
				add({ kind: "note", text: note }, l.cond);
				report.count(".train pet spell learned by fighting -> note");
				continue;
			}
			// A profession by spell id (".train 2018,3") or in the text; Anti-Venom is First Aid.
			const [spell, flags] = n === "train" ? l.args.split(",").map((x) => Number(x.trim())) : [];
			const prof = PROFESSION_SPELLS[spell] || (note.match(/\[([^\]]+)\]/) || [])[1] || (note.match(/\btrain\s+(Mining|Herbalism|Skinning|Alchemy|Blacksmithing|Enchanting|Engineering|Leatherworking|Tailoring|First Aid|Cooking|Fishing)\b/i) || [])[1];
			const profName = prof && [...PROFESSIONS].find((p) => p.toLowerCase() === prof.toLowerCase());
			if (profName) {
				// ".train <id>,1|3" without text is RXP's skip check ("Mining Trained"): the step
				// shows only while the skill is known (3) or not yet known (1), no trainer visit.
				if (!note && flags) {
					// Only the first rank's spell says "has the profession"; a recipe or later rank cannot be told by skill.
					if (PROFESSION_SPELLS[spell] && PROFESSION_BASE.has(spell)) whens.push(`${flags & 2 ? "" : "!"}skill ${profName.includes(" ") ? JSON.stringify(profName) : profName} 1`);
					if (PROFESSION_BASE.has(spell)) { formatNeeds = Math.max(formatNeeds, 5); report.count(".train profession check -> when skill"); }
					else report.count(".train recipe check without text (dropped)");
					continue;
				}
				// Polestar finds a profession's trainer by its own data; without that, the one RXP targets.
				const pnpc = (npcFor("trainer", l.cond, opt) || npcFor("trainer", l.cond, { ...opt, names: true }));
				if (pnpc || data.hasProfessions) add({ kind: "train", profession: profName, npc: pnpc ? pnpc.id : undefined }, l.cond);
				else { add({ kind: "task", text: note || `Train ${profName}` }, l.cond); formatNeeds = 5; }
				report.count(pnpc || data.hasProfessions ? ".train profession -> train <Profession>" : ".train profession, trainer unknown -> task");
				continue;
			}
			// Pets, mounts: not the class trainer's lesson.
			if (n === "trainer" && /\bmount\b/i.test(note)) { report.count(".trainer for a mount (ignored)"); continue; }
			// RXP writes ".train <spell>" and ".trainer" together at one trainer: one goal is enough.
			if (n === "trainer" && step.lines.some((x) => x.kind === "cmd" && x.name === "train" && condsMeet(x.cond, l.cond))) { report.count(".trainer beside .train (covered)"); continue; }
			// ".trainer" for all, ".target Briarthorn << Warlock", ".target Brandur << Paladin": each class at its own trainer.
			const targetConds = [...new Set(targets.filter((t) => t.cond).map((t) => t.cond))];
			if (n === "trainer" && !l.cond && targetConds.length > 1) {
				for (const tc of targetConds) {
					const tn = npcFor("trainer", tc);
					add(tn ? { kind: "train", npc: tn.id, comment: note || undefined } : { kind: "train", class: true, comment: note || undefined }, tc);
				}
				report.count(".trainer with a target per class -> one train per class");
				continue;
			}
			const npc = (npcFor("trainer", l.cond, opt) || npcFor("trainer", l.cond, { ...opt, names: true }));
			// A class guide's own class counts too: "train class" for a Mage guide is the Mage's.
			const ownClasses = parseCondition(l.cond, ctx.scope).only.class || cond.only.class || null;
			const lineClasses = ownClasses || (ctx.classes.length ? ctx.classes : CLASSES);
			if (npc) add({ kind: "train", npc: npc.id, comment: note || undefined }, l.cond);
			else {
				// Data gap: Polestar has no Horde Paladin class trainer (lint/playtest say so).
				const rest = lineClasses.filter((c) => c !== "Paladin");
				if (lineClasses.includes("Paladin")) {
					add({ kind: "task", text: note || "Train at your class trainer" }, "Paladin"); formatNeeds = 5;
					report.count("train (Paladin, no trainer in data) -> task");
				}
				if (rest.length) {
					add({ kind: "train", class: true, comment: note || undefined }, ownClasses && rest.length < CLASSES.length ? rest.join("/") : null);
					report.note(ctx.name, stepNo, "trainer not resolved; `train class` used", note);
				}
			}
		} else if (n === "use") {
			const id = Number(l.args.split(",")[0]);
			if (data.items[id]) add({ kind: "use", item: id }, l.cond);
			else { add({ kind: "task", text: plain(l.text) || "Use item " + id }, l.cond); formatNeeds = 5; }
		} else if (n === "xp") {
			// RXP: ".xp <12,1" skips the step while below level 12 (second number = skip);
			// ".xp 16,1" / ".xp >16,1" skips it from level 16 on; ".xp 3+895" and ".xp 48.5"
			// (a share of the level) are grind goals, and so is a bare ".xp 8".
			const m = l.args.match(/^([<>]?)\s*(\d+)(?:\.(\d+)|\+(\d+))?(?:,\s*(-?\d+))?$/);
			if (!m) report.count(".xp (unparsed)");
			else if (m[5] && Number(m[5]) !== 0 && !l.cond) {
				const lv = m[3] ? `${m[2]}.${m[3]}` : m[4] ? `${m[2]}+${m[4]}` : m[2];
				whens.push(m[1] === "<" ? `level>=${lv}` : `level<${lv}`);
				report.count(".xp skip form -> when level");
			} else if (!m[5] && m[1] === "" && (!completewith || m[4])) {
				// "level 48.5": whole percent only; one that rounds to 0 or 100 is a plain level.
				const share = m[3] ? Math.round(Number(`0.${m[3]}`) * 100) : 0;
				const level = m[3] && share >= 1 && share <= 99 ? Number(`${m[2]}.${m[3]}`) : Number(m[2]) + (share >= 100 ? 1 : 0);
				add({ kind: "level", level, xp: m[4] ? Number(m[4]) : undefined }, l.cond);
				// What the line says besides the level it names is the grind's text.
				const said = plain(l.text);
				if (said && !l.cond && !/^grind (to|until) (level )?[\d\s+\/.,]*(xp)?\.?$/i.test(said)) tips.push(bare(said));
				report.count(m[3] ? ".xp N.F -> level" : m[4] ? ".xp L+N -> level" : ".xp N -> level");
			} else report.count(completewith && !m[5] ? ".xp target in a step beside the route (farm signal only)" : ".xp (ignored)");
		} else if (n === "skill") {
			const m = l.args.match(/^([a-z]+),\s*(\d+)$/i);
			const w = skillWhen(l.args);
			if (m && SKILLS[m[1].toLowerCase()]) { add({ kind: "skill", skill: SKILLS[m[1].toLowerCase()], n: Number(m[2]) }, l.cond); report.count(".skill -> skill"); }
			else if (w && !l.cond) { whens.push(w); formatNeeds = Math.max(formatNeeds, 5); report.count(".skill skip form -> when skill"); }
			else report.count(".skill (ignored)");
		} else if (n === "cooldown") {
			const w = cooldownWhen(l.args);
			if (w && !l.cond) { whens.push(w); formatNeeds = Math.max(formatNeeds, 5); report.count(".cooldown -> when cooldown"); }
			else report.count(".cooldown not expressible (ignored)");
		} else if (n === "money") {
			// RXP's `.money <N` (N in gold) skips the step while the character has less, `>N`
			// while they have that much or more: Polestar's `when money`, in copper.
			const w = moneyWhen(l.args);
			if (w && !l.cond) { whens.push(w); formatNeeds = Math.max(formatNeeds, 5); report.count(".money -> when money"); }
			else report.count(".money not expressible (ignored)");
		} else if (n === "fp" && flightOf(l)) {
			add({ kind: "getfp", location: flightOf(l) }, l.cond);
			report.count(".fp -> getfp");
		} else if (n === "dungeon") {
			const arg = String(l.args || "").trim();
			const name = DUNGEONS[arg.replace(/^!/, "").toUpperCase()];
			if (!name || l.cond) report.count(`.dungeon ${name ? "on a class line" : "unknown"} (ignored)`);
			else { whens.push(`${arg.startsWith("!") ? "!" : ""}dungeon ${JSON.stringify(name)}`); formatNeeds = Math.max(formatNeeds, 5); report.count(".dungeon -> when dungeon"); }
		} else if (n === "zoneskip" || n === "subzoneskip") {
			// Skipped while in that zone (flag 1: while not in it).
			const [zones, flags] = String(l.args || "").split(",").map((x) => x.trim());
			const names = (zones || "").split(/[+/]/).map((z) => (/^\d+$/.test(z) ? (n === "zoneskip" ? zoneName(data, Number(z)) : null) : z)).filter(Boolean);
			const kind = n === "zoneskip" ? "zone" : "subzone";
			const reverse = (Number(flags) || 0) & 1;
			if (!names.length || l.cond || (reverse && names.length > 1)) report.count(`.${n} not expressible (ignored)`);
			else { for (const z of names) whens.push(`${reverse ? "" : "!"}${kind} ${JSON.stringify(z)}`); report.count(`.${n} -> when ${reverse ? "" : "!"}${kind}`); }
		} else if (n === "itemcount") {
			// Shown while the bags hold that many (RXP: >= N by default, <N, >N, =N).
			const [ids, rule] = String(l.args || "").split(",").map((x) => x.trim());
			const m = String(rule || "").replace(/\s/g, "").match(/^([<>]?)(=?)(\d+)$/);
			const id = /^\d+$/.test(ids || "") ? Number(ids) : null;
			if (!m || !id || l.cond || (m[2] && !m[1])) report.count(".itemcount not expressible (ignored)");
			else {
				const total = Number(m[3]);
				const neg = m[1] === "<";
				const x = neg ? (m[2] ? total + 1 : total) : m[1] === ">" ? (m[2] ? total : total + 1) : total;
				// "at least 0" always holds, "fewer than 0" never: no predicate for either.
				if (x < 1) report.count(".itemcount of 0 (no condition)");
				else { whens.push(`${neg ? "!" : ""}has ${id} x${x}`); report.count(".itemcount -> when has"); }
			}
		} else if (n === "bindlocation") {
			// Skipped while the hearth is bound there (flag 1: while it is not).
			const [area, flags] = String(l.args || "").split(",").map((x) => x.trim());
			const inn = data.inns.find((i) => i.area === Number(area));
			if (!inn || l.cond) report.count(".bindlocation not expressible (ignored)");
			else { whens.push(`${(Number(flags) || 0) & 1 ? "" : "!"}bound ${JSON.stringify(inn.location)}`); report.count(".bindlocation -> when bound"); }
		} else if (n === "maxlevel") {
			const m = String(l.args || "").match(/^\s*(\d+)/);
			if (!m || l.cond) report.count(".maxlevel not expressible (ignored)");
			else { whens.push(`level<${Number(m[1]) + 1}`); report.count(".maxlevel -> when level"); }
		} else if (WHEN_OF[n]) {
			const [kind, neg] = WHEN_OF[n];
			const ids = String(l.args).split(",").map((x) => Number(x.trim())).filter((x) => x > 0);
			if (l.cond || !ids.length) report.count(`.${n} on a class line or without ids (ignored)`);
			else if (kind === "onquest" || ids.length === 1) { whens.push(`${neg ? "!" : ""}${kind} ${ids.join(",")}`); report.count(`.${n} -> when ${neg ? "!" : ""}${kind}`); }
			else report.count(`.${n} with several quests (Polestar takes one; ignored)`);
		} else if (n === "fly" && flightOf(l)) {
			add({ kind: "fly", location: flightOf(l) }, l.cond);
			report.count(".fly -> fly");
		} else if (n === "group") {
			// The step needs a group (of N): shown on its quest work.
			group = Number(l.args) >= 2 ? Number(l.args) : true;
			if (l.cond) groupForSome = true;
		} else if (n === "home") {
			const inn = innNamed(data, (plain(l.text).match(/Hearthstone to (.+?)\.?$/i) || [])[1] || String(l.args || "").trim(), firstPt, ctx.faction);
			add({ kind: "sethome", location: inn ? inn.location : undefined }, l.cond);
			ctx.bind = inn ? inn.location : null;
			report.count(inn ? ".home -> sethome" : ".home -> sethome nearest");
		} else if (n === "hs" && ((plain(l.text).match(/Hearth(?:stone)? to (.+?)\.?$/i) || [])[1] || ctx.bind)) {
			const name = (plain(l.text).match(/Hearth(?:stone)? to (.+?)\.?$/i) || [])[1];
			const inn = name ? innNamed(data, name, null, ctx.faction, ctx.bind) : null;
			add({ kind: "hearth", location: inn ? inn.location : name || ctx.bind }, l.cond);
			report.count(".hs -> hearth");
		} else if (n === "usespell" && goals.some((g) => g.kind === "cast" && g.spell === Number(l.args.split(",")[0]))) {
			report.count(".usespell beside its .cast (dropped)");
		} else if (nativeGoal(n, l, data, ctx.spells)) {
			// A goal that checks itself instead of a tick.
			const g = nativeGoal(n, l, data, ctx.spells);
			add(g, l.cond);
			formatNeeds = Math.max(formatNeeds, 5);
			report.count(`.${n} -> ${g.kind}`);
		} else if (n === "usespell") {
			report.count(".usespell without a spell name (dropped: a button in RXP)");
		} else if (TASKS.has(n)) {
			const t = plain(l.text) || n;
			if (n === "destroy") { const id = Number(l.args.split(",")[0]); if (data.items[id] && !l.cond) whens.push(`has ${id}`); }
			add({ kind: "task", text: t }, l.cond);
			formatNeeds = 5;
			report.count(`.${n} -> task`);
		} else if (n === "zone" && !completewith && !l.cond) {
			// RXP's step is done once the player is in the zone: Polestar's `enter`, the
			// arrow at RXP's last point. A step beside the route stays a way (below).
			const arg = String(l.args || "").trim();
			const name = /^\d+$/.test(arg) ? zoneName(data, Number(arg)) : arg;
			if (name) { enterZone = name; report.count(".zone -> enter"); }
			else report.count(".zone unknown map (ignored)");
		} else if (n === "goto" || n === "waypoint") {
			// handled below
		} else if (IGNORED.has(n)) {
			report.count(`.${n} (ignored)`);
		} else {
			report.count(`.${n} (unknown)`);
			report.note(ctx.name, stepNo, `unknown command .${n}`, l.args);
		}
	}

	if (enterZone) {
		const last = [...gotos].reverse().find((g) => g.uiMap);
		goals.push({ kind: "enter", place: enterZone, at: at(last), only: "" });
		formatNeeds = Math.max(formatNeeds, 5);
	}
	if (!completewith && goals.length && goals.every((g) => g.kind === "note")) {
		for (const g of goals) g.kind = "task";
		formatNeeds = 5;
		report.count("instruction-only step -> task");
	}
	// Loop points in one map frame, as Polestar wants them.
	const placeable = gotos.filter((g) => (g.r !== 0 || gotos.length === 1) && g.live === (gotos[0] || {}).live);

	if (!goals.length && closed) {
		report.count("step: every goal closed to these races (dropped)");
		return null;
	}
	// A step done along the way (`#completewith`), sorted by what RXP's step holds:
	// - text and a farming signal (.mob, .money, .itemcount <N, an .xp target):
	//   work here first, a step of its own with a task to tick, in the middle of
	//   RXP's points;
	// - text and arrow points only: the way to the next step, the text a note there;
	// - text alone: a reminder beside the steps up to its target, as a task in
	//   Along the way (Polestar lists no notes there);
	// - goals: along as they are. Only arrow points of steps that neither farm nor
	//   fight are a way to walk; the rest are rounds Polestar finds spots for itself.
	let forceAlong = false;
	if (completewith) {
		const only = onlyText(cond.only);
		const farm = step.lines.some((l) => l.kind === "cmd" && (l.name === "mob" || l.name === "money"
			|| (l.name === "itemcount" && l.args.includes("<")) || (l.name === "xp" && !/,\s*1\s*$/.test(l.args))));
		const fights = goals.some((g) => ["kill", "collect", "complete", "interact"].includes(g.kind));
		const way = gotos.filter((g) => g.uiMap && !g.noArrow);
		if (!goals.length && (tips.length || notes.length)) {
			for (const t of [...tips, ...notes]) goals.push({ kind: "note", text: t, only: "" });
			if (!title) title = tips[0] || notes[0];
			tips.length = 0;
			notes.length = 0;
		}
		const textOnly = goals.every((g) => g.kind === "note");
		// A flight, a flight point or an inn has an arrow of its own to where it is done: the
		// points before it are the walk there, not the way into the step after it.
		const selfPlaced = goals.some((g) => ["fly", "getfp", "sethome"].includes(g.kind));
		if (!farm && !fights && !selfPlaced) for (const g of way) ctx.path.push({ ...g, only });
		else if (selfPlaced && way.length) report.count("waypoints of a flight/inn step (the goal's own arrow leads there; not carried on)", way.length);
		if (goals.length && textOnly) {
			if (farm) {
				const placed = gotos.filter((g) => g.uiMap);
				const spot = at(placed[Math.floor((placed.length - 1) / 2)]);
				for (const g of goals) { g.kind = "task"; g.at = spot; }
				info = true;
				report.count("along text: work here first -> task step");
			} else if (way.length) {
				ctx.pendingNotes.push(...goals.map((g) => ({ ...g, only: g.only || only })));
				goals.length = 0;
				report.count("along text: way -> note in the next step");
			} else {
				for (const g of goals) g.kind = "task";
				forceAlong = true;
				report.count("along text: reminder -> task in Along the way");
			}
			formatNeeds = 5;
		}
	}
	if (!goals.length && (completewith || (!notes.length && !gotos.length))) {
		if (gotos.length || tips.length || notes.length) report.count("step: waypoints only (kept as the way into the next step)");
		return null;
	}
	// A grind step (`level` goals only) keeps RXP's last point as the place to go to.
	const grindOnly = goals.length > 0 && goals.every((g) => g.kind === "level") && !completewith;
	if ((!goals.length && !notes.length || grindOnly) && gotos.length) {
		const g = gotos[gotos.length - 1];
		if (g.uiMap) usedMaps.push(g.uiMap);
		goals.unshift({ kind: "goto", x: g.x, y: g.y, live: g.live, text: tips[0] && !grindOnly ? shorten(tips[0], 80) : undefined, only: "" });
	}

	// Group work about one quest: the player says whether they do it with a group
	// (`when group`, asked once per quest, on every step of it as in RXP). Else it
	// holds no solo player: optional, as Polestar does with elites.
	if (group) {
		const groupQuests = new Set(goals.filter((g) => GROUP_KINDS.has(g.kind)).map((g) => g.quest).filter((q) => q != null));
		const [q] = groupQuests;
		const ask = groupQuests.size === 1 && !groupForSome && data.quests[q];
		// Taking and handing in hold, as in RXP: a quest the player never took drops its turn-in by itself.
		for (const g of goals) if (GROUP_KINDS.has(g.kind)) { g.group = group; if (!ask && g.kind !== "accept" && g.kind !== "turnin") g.optional = true; }
		if (ask) { whens.push(`group ${q}`); formatNeeds = Math.max(formatNeeds, 5); report.count(".group, one quest -> when group"); }
		else report.count(".group -> group, optional");
	}
	const allAlong = forceAlong || goals.length > 0 && goals.every((g) => ALONG_KINDS.has(g.kind) || ((g.kind === "use" || g.kind === "interact") && g.quest != null));
	// The way here: the waypoints of the steps done along the way before this one.
	// Of the way, a goal with a place of its own keeps the last point and those on
	// other maps (leaving a city); one without keeps every point. Repeats go.
	if (!completewith && !isLoop && ctx.path.length) {
		const seenAt = new Set();
		let way = ctx.path.filter((p) => { const k = `${p.uiMap}:${p.x}:${p.y}`; return !seenAt.has(k) && seenAt.add(k); });
		const placedGoal = goals.some((g) => g.at || ["accept", "turnin", "vendor", "train", "buy", "complete", "kill", "collect", "interact"].includes(g.kind));
		const here = mapId || (ctx.lastPlace || {}).uiMap;
		if (placedGoal) way = way.filter((p, i) => i === way.length - 1 || (here && p.uiMap !== here));
		goals.unshift(...way.map((p) => ({ kind: "goto", x: p.x, y: p.y, live: p.live, map: p.uiMap, r: p.r > 0 ? p.r : undefined, only: p.only, optional: true })));
		report.count("waypoints -> path into the next step", way.length);
		ctx.path = [];
	}
	if (!completewith && ctx.pendingNotes.length) {
		goals.push(...ctx.pendingNotes);
		ctx.pendingNotes = [];
	}
	// A goal the data places (giver, vendor, trainer) sits where RXP's own .goto points.
	if (!usedMaps.length && mapId && goals.some((g) => ["accept", "turnin", "vendor", "train", "buy", "complete"].includes(g.kind))) usedMaps.push(mapId);
	// Accepts in a step with `when` may not happen: their quests' later goals wait
	// for the quest, like those of quests taken in an earlier guide.
	for (const g of goals) if (g.kind === "accept") (whens.length || g.optional || ctx.loose.has(g.quest) ? ctx.maybeTaken : ctx.surelyTaken).add(g.quest);
	// An abandon applies only while the quest is in the log, as in RXP: a step that
	// drops a quest the character never had, or took again later, would hold the
	// route (Polestar 0.3.0 loops on it).
	const orphanOf = (g) => {
		if (g.kind === "abandon") return g.quest;
		const id = questOf(g);
		if (id == null) return null;
		// RXP shows a `.turnin -Q` only while Q is in the log: unless this guide takes Q, so does Polestar.
		if (negGoals.has(g) && !ctx.ownSeen.has(id)) return id;
		// A dungeon detour (`when dungeon`) works quests its dungeon guide hands out: unless this guide takes them, they wait for the quest.
		if (g.kind !== "accept" && whens.some((w) => w.startsWith("dungeon ")) && !ctx.ownSeen.has(id)) return id;
		const unsure = ctx.maybeTaken.has(id) && !ctx.surelyTaken.has(id) && !goals.some((a) => a.kind === "accept" && a.quest === id);
		return !ctx.seen.has(id) || unsure ? id : null;
	};
	const orphanGoals = goals.filter((g) => orphanOf(g));
	const base = {
		stepNo, title: title || tips[0] || notes[0] || null, only: cond.only, goals, tips: [...eliteTips, ...tips], notes, whens, maps: usedMaps, loop: isLoop ? placeable : [],
		completesWith: completewith ? (completewith.args.trim() === "next" ? "next" : labelOf(completewith.args)) : null, sticky, label: labelDef, format: formatNeeds, allAlong, info: info && !whens.length,
	};
	if (!orphanGoals.length) return [base];
	// A quest taken up in an earlier file (or left out of this one): its goals go
	// in their own step that only applies while the quest is in the log.
	// One step per quest: a player holding one of them must not wait on another's goals.
	const ids = [...new Set(orphanGoals.map(orphanOf))];
	report.count(`goals for quests accepted elsewhere or abandoned -> when onquest (${orphanGoals.length})`);
	const rest = goals.filter((g) => !orphanOf(g));
	// Each goal brings the text lines before its command: a split step shows its own goals'
	// tips and a title of their own (an accept's or turn-in's, else its first tip), not the
	// heading of the neighbouring quest.
	const tipsOf = (gs) => [...new Set(gs.flatMap((g) => ownTips.get(g) || []))];
	const eliteTipsOf = (gs) => [...new Set(gs.map((g) => ownElite.get(g)).filter(Boolean))];
	const titleOf = (gs) => gs.map((g) => goalTitle.get(g)).find(Boolean) || tipsOf(gs)[0] || null;
	const orphanTips = new Set(tipsOf(orphanGoals));
	const orphanElite = new Set(eliteTipsOf(orphanGoals));
	const loose = base.tips.filter((t) => !orphanTips.has(t) && !orphanElite.has(t));
	const orphanSteps = ids.map((id) => {
		const own = orphanGoals.filter((g) => orphanOf(g) === id);
		return { ...base, title: own.includes(titleGoal) ? base.title : titleOf(own), maps: [], goals: own, tips: [...eliteTipsOf(own), ...tipsOf(own)], notes: [], whens: [...new Set([...whens, `onquest ${id}`])], label: null, completesWith: null, loop: [] };
	});
	// An accept written after the hand-in of its prerequisite must stay after it: the
	// steps follow the source's order, and a way point goes with the goal it leads to.
	const acceptAfterOrphan = goals.some((g, i) => g.kind === "accept" && !orphanOf(g) && goals.slice(0, i).some(orphanOf));
	if (!acceptAfterOrphan) {
		if (!rest.length) { orphanSteps[0] = { ...orphanSteps[0], tips: [...orphanSteps[0].tips, ...loose], notes }; return orphanSteps; }
		// In the source's order: a hand-in written before an accept comes first.
		const restStep = { ...base, goals: rest, tips: loose, title: orphanGoals.includes(titleGoal) ? rest.map((g) => goalTitle.get(g)).find(Boolean) || loose[0] || null : base.title };
		return goals.indexOf(orphanGoals[0]) < goals.indexOf(rest[0]) ? [...orphanSteps, restStep] : [restStep, ...orphanSteps];
	}
	const keyOf = goals.map((g) => orphanOf(g));
	for (let i = goals.length - 1; i >= 0; i--) if (goals[i].kind === "goto") keyOf[i] = i + 1 < goals.length ? keyOf[i + 1] : keyOf[i - 1] ?? null;
	const runs = [];
	goals.forEach((g, i) => {
		const last = runs[runs.length - 1];
		if (last && last.key === keyOf[i]) last.goals.push(g);
		else runs.push({ key: keyOf[i], goals: [g] });
	});
	const firstRest = runs.findIndex((r) => r.key == null);
	const out = runs.map((r, i) => {
		const title = r.goals.includes(titleGoal) ? base.title : titleOf(r.goals);
		const tips = [...eliteTipsOf(r.goals), ...tipsOf(r.goals)];
		if (r.key == null) return i === firstRest ? { ...base, title, goals: r.goals, tips: [...tips, ...loose], label: null } : { ...base, title, goals: r.goals, tips, notes: [], label: null, completesWith: null, loop: [] };
		// The first step keeps the zone its way points are in.
		return { ...base, title, maps: i === 0 ? base.maps : [], goals: r.goals, tips, notes: [], whens: [...new Set([...whens, `onquest ${r.key}`])], label: null, completesWith: null, loop: [] };
	});
	if (firstRest < 0) out[0] = { ...out[0], tips: [...out[0].tips, ...loose], notes };
	// What waits for this step waits for all of it: the label sits on its last part.
	out[out.length - 1].label = base.label;
	return out;
}

// A guide whose name gives no levels (dungeon quest guides): from the level at
// which every quest it takes can be taken to the highest quest. It is run once,
// with all its quests at hand, not levelled through.
function levelsOf(quests, data) {
	let lo = 0, hi = 0;
	for (const id of quests) {
		const q = data.quests[id];
		if (!q || !(q.level > 0)) continue;
		lo = Math.max(lo, q.minLevel > 0 ? q.minLevel : q.level);
		hi = Math.max(hi, q.level);
	}
	return hi ? `${lo}-${Math.max(lo, hi)}` : null;
}

// Where the guide sits in Polestar's menu: RXP's dungeon quest guides under
// Dungeons, each other RXP group in a folder of its own ("RXP Forever Dungeon Guide").
function menuPlace(group, subgroup) {
	const sub = String(subgroup || "").replace(/<<.*$/, "").trim();
	const name = String(group || "").replace(/<<.*$/, "").replace(/\(([AH])\)/g, "").replace(/^(RestedXP|RXP)\s+/i, "").replace(/\s+/g, " ").trim();
	if (!name) return { category: "Leveling" };
	if (/dungeon quest/i.test(name)) return { category: "Dungeons" };
	return { category: "Leveling", folder: `RXP ${name}${sub ? " · " + sub : ""}` };
}

// The races a header's `<<` line limits a guide to. "<< Alliance !NightElf" names every
// race but one: those of the other side go, and all of the side's races limit nothing.
const SIDE_RACES = { Alliance: ["Human", "Dwarf", "Gnome", "NightElf", "Skyborne"], Horde: ["Orc", "Troll", "Tauren", "Undead", "Skyborne"] };
export function headerRaces(races, faction) {
	const side = SIDE_RACES[faction];
	if (!races) return [];
	if (!side) return races;
	const own = races.filter((r) => side.includes(r));
	return own.length === side.length ? [] : own;
}

export function convertGuide(parsed, data, opts) {
	const { report, slug, packId } = opts;
	// RXP's `#displayname` is the name it shows (the name itself can be an internal key).
	// One with a condition ("<< Paladin") names it for some characters only: not the title.
	const shown = (parsed.header.flags || []).find((f) => f.startsWith("displayname ") && !f.includes("<<")) || "";
	const info = parseName(shown.slice("displayname ".length).trim() || parsed.header.name);
	const titles = new Map();
	for (const s of parsed.steps) for (const l of s.lines) {
		if (l.kind === "cmd" && (l.name === "accept" || l.name === "turnin") && l.text) {
			const id = Number((l.args.match(/^-?(\d+)/) || [])[1]);
			if (id && !titles.has(id)) titles.set(id, plain(l.text).replace(/^(accept|turn in)\s+/i, ""));
		}
	}
	// `before`: quests accepted in the guides that hand off into this one.
	// `seen` grows with this guide's accepts in route order; a goal for a quest
	// not seen yet goes in a step of its own that waits for the quest.
	const before = opts.before || new Set();
	const accepted = new Set(before);
	for (const s of parsed.steps) for (const l of s.lines) {
		if (l.kind === "cmd" && l.name === "accept") accepted.add(Number((l.args.match(/^-?(\d+)/) || [])[1]));
	}
	const hc = parseCondition(parsed.header.faction).only;
	const faction = hc.faction ? hc.faction[0] : null;
	// Only a `<<` line of the header limits the guide; `#defaultfor` just picks which guide
	// RXP offers first, every character may still run the others.
	const races = headerRaces(hc.race, faction);
	// What the guide is for: inside it a condition counts as exact when it is a product there.
	const scope = { class: hc.class || null, race: races.length ? races : null, faction: hc.faction || null };
	const ctx = { report, name: parsed.header.name || slug, titles, accepted, ownSeen: new Set(), seen: new Set(before), spells: opts.spells || spellNames([parsed]), faction, races, scope, classes: hc.class || [], loose: new Set(), maybeTaken: new Set(), surelyTaken: new Set(), lastPlace: null, path: [], pendingNotes: [], bind: null, drop: dropTags(opts.selfFound) };
	const steps = [];
	parsed.steps.forEach((s, i) => {
		for (const b of buildStep(s, i + 1, data, ctx) || []) steps.push(b);
	});

	// A step of text alone holds as a task of its own (merging it into later steps read badly).
	for (const s of steps) if (s.info) s.completesWith = null;

	let defaultMap = null;
	const zone = (() => {
		for (const s of parsed.steps) for (const l of s.lines) if (l.kind === "cmd" && l.name === "goto") {
			const m = l.args.match(/^(\d+)\//);
			if (m) { defaultMap = Number(m[1]); return zoneName(data, defaultMap); }
		}
		const named = zoneIdNamed(data, info.zone);
		if (named) defaultMap = named;
		if (named) return zoneName(data, named);
		// Else the zone of the first step that is somewhere.
		const first = steps.find((s) => (s.maps || []).length);
		if (first) defaultMap = first.maps[0];
		return first ? zoneName(data, first.maps[0]) : null;
	})();
	const guide = {
		name: parsed.header.name || slug,
		title: info.zone || parsed.header.name,
		faction,
		classes: hc.class || null,
		races,
		levels: info.levels || levelsOf([...accepted].filter((id) => !before.has(id)), data) || (String(parsed.header.subgroup || "").match(/\b(\d+-\d+)\b/) || [])[1] || null,
		zone,
		defaultMap,
		...menuPlace(parsed.header.group, parsed.header.subgroup),
		sourceSteps: parsed.steps.length,
		steps,
	};
	return render(guide, { report, slug, packId, next: opts.next || [] });
}
