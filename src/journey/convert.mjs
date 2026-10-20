// Parsed Journey guide (src/journey/parse.mjs) -> the intermediate form
// (src/ir.mjs) plus a report of what was not carried over one to one. Ids,
// names and places come from Polestar's data; what it does not know is left out
// and listed, never guessed.

import { evaluate, pairsOf, toWhens, onlyString, onlyFor, show, localOnly, RACE_NAMES, CLASS_NAMES } from "./cond.mjs";
import { worldToZone, questOpenTo, questEndPlaced, eliteOf } from "../data.mjs";
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

// Text of a Journey text task: strings and inline refs, flattened.
function textOf(node, ctx, pairs) {
	const parts = [];
	const walk = (n) => {
		if (n == null) return;
		if (typeof n === "string") { parts.push(n); return; }
		if (typeof n !== "object") { parts.push(String(n)); return; }
		if (!isTable(n)) return;
		const k = n.kv;
		if (k.condition && !holds(k.condition, pairs, ctx, true)) return;
		if (k.npc != null) parts.push(k.label || entityName(ctx, "npc", k.npc));
		else if (k.item != null) parts.push(k.label || entityName(ctx, "item", k.item));
		else if (k.spell != null) parts.push(k.label || entityName(ctx, "spell", k.spell));
		else if (k.quest != null) parts.push(k.label || entityName(ctx, "quest", k.quest));
		else if (k.gameobject != null) parts.push(k.label || entityName(ctx, "object", k.gameobject));
		else if (k.area != null) parts.push(k.label || (typeof k.area === "string" ? k.area : entityName(ctx, "area", k.area)));
		else if (k.zone != null) parts.push(k.label || entityName(ctx, "zone", k.zone));
		else if (k.taxi != null) parts.push(k.label || entityName(ctx, "taxi", k.taxi));
		else if (k.skill != null) parts.push(k.label || String(k.skill));
		else if (k.location != null) {
			// The step's own location N, as coordinates.
			const l = (ctx.stepLocations || [])[Number(k.location) - 1];
			const p = l && parseLocation(arr(l)[0], ctx.data);
			parts.push(k.label || (p ? `${p.x.toFixed(1)}, ${p.y.toFixed(1)}` : ""));
		}
		// A "NOTE:"/"TIP:" label starts a sentence of its own.
		for (const f of ["red", "tip", "note"]) if (typeof k[f] === "string") parts.push((parts.length && !/\s$/.test(parts[parts.length - 1]) ? " " : "") + k[f]);
		for (const f of ["bold", "italic"]) if (typeof k[f] === "string") parts.push(k[f]);
		if (typeof k.paragraph === "string") parts.push(" " + k.paragraph);
		if (k.newline) parts.push(" ");
		for (const x of n.arr) walk(x);
	};
	walk(node);
	return parts.join("").replace(/\|c[0-9a-fA-F]{8}|\|r/g, "").replace(/\s+/g, " ").trim();
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
	return evaluate(text, pairs, { local, fixed: ctx.fixed }).length > 0;
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
		ctx.report.note(ctx.name, stepNo, `quest ${q} has no objective ${n} in the data; whole quest used`);
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

function buildStep(st, stepNo, ctx) {
	const { data, report, names, universe } = ctx;
	const sk = kv(st);
	const out = [];
	const variants = evaluate(sk.condition, universe, { fixed: ctx.fixed });
	if (!variants.length) { report.count("step: for no Forever character (dropped)"); return out; }
	for (const v of variants) {
		let whens = [];
		if (v.residual) {
			const w = toWhens(v.residual, names);
			if (w) { whens = w.whens; if (w.near) report.count("step condition: quest state approximated"); report.count("step condition -> when"); }
			else if (localOnly(v.residual)) report.count("step condition on location state (step kept for all)");
			else { report.count("step condition at runtime Polestar cannot check (step kept for all)"); report.note(ctx.name, stepNo, "step condition not carried over", show(v.residual)); }
		}
		out.push(...buildVariant(st, stepNo, ctx, v.only, v.pairs, whens));
	}
	return out;
}

function buildVariant(st, stepNo, ctx, stepOnly, stepPairs, stepWhens) {
	const { data, report, names } = ctx;
	const sk = kv(st);
	if (sk.completed) report.count("step `completed` expression (ignored)");
	ctx.stepLocations = arr(sk.locations);

	// Places: the step's locations a Forever character sees.
	const places = [];
	for (const l of arr(sk.locations)) {
		const lk = kv(l);
		if (lk.condition && !holds(lk.condition, stepPairs, ctx, true)) continue;
		const p = parseLocation(arr(l)[0], data);
		if (!p) { report.count("location without a map frame (dropped)"); continue; }
		if (p.flags.includes("H")) continue;
		places.push({ ...p, npc: lk.npc, object: lk.gameobject, label: lk.label });
	}
	const npcPlace = (id) => places.find((p) => p.npc === id) || null;
	const objectPlace = (id) => places.find((p) => p.object === id) || null;
	const mapId = (places[0] || {}).uiMap || ctx.lastMap;
	if (places.length) ctx.lastMap = places[places.length - 1].uiMap;
	const atOf = (p) => (p ? { x: p.x, y: p.y, live: p.live, map: p.uiMap !== mapId ? p.uiMap : undefined } : undefined);

	const wayIn = [...places].reverse().find((p) => !p.npc && !p.object) || null;
	// Chunks: goals in the source's order, split where the `when` they need changes.
	const chunks = [];
	const chunk = (whens) => {
		const key = whens.join("|");
		const last = chunks[chunks.length - 1];
		if (last && last.key === key) return last;
		const c = { key, whens, goals: [], tips: [], notes: [], along: [] };
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
		const gVariants = evaluate(gk.condition, stepPairs, { fixed: ctx.fixed });
		if (!gVariants.length) return;
		const refs = refsOf(group);
		const merchantHere = arr(group).some((x) => isTable(x) && x.kv.merchant != null);
		const npcsHere = arr(group).filter((t) => isTable(t) && typeof t.kv.npc === "number" && Object.keys(t.kv).length <= 2).map((t) => t.kv.npc);
		const cands = [...npcsHere, ...refs.npcs, ...places.map((p) => p.npc).filter(Boolean)];
		const roleNpc = (role) => cands.find((id) => data.npcs[id] && (data.npcs[id].roles || []).includes(role)) || null;
		// A class trainer by the title the data gives them ("Warlock Trainer").
		const trainerOf = (cls) => cands.find((id) => data.npcs[id] && data.npcs[id].subName === `${cls} Trainer`) || null;
		for (const gv of gVariants) {
			let gWhens = [];
			if (gv.residual) {
				const w = toWhens(gv.residual, names);
				if (w) { gWhens = w.whens; if (w.near) report.count("group condition: quest state approximated"); }
				else if (localOnly(gv.residual)) report.count("group condition on the step's location state (kept for all)");
				else { report.count("group condition at runtime Polestar cannot check (kept for all)"); report.note(ctx.name, stepNo, "group condition not carried over", show(gv.residual)); }
			}
			const groupPairs = gv.pairs;
			// Buttons that do something: destroy an item.
			for (const b of arr(gk.buttons)) {
				const bk = kv(b);
				if (bk.destroy == null) continue;
				if (bk.condition && !holds(bk.condition, groupPairs, ctx, false)) continue;
				const item = Number(bk.destroy);
				if (ctx.native.has("destroy") && data.items[item]) { chunk(gWhens).goals.push({ kind: "destroy", item, only: "" }); format = Math.max(format, 6); report.count("destroy button -> destroy"); }
				else { chunk(gWhens).goals.push({ kind: "task", text: `Destroy ${entityName(ctx, "item", item)}`, only: "" }); format = Math.max(format, 5); report.count("destroy button -> task"); }
			}
			for (const task of arr(group)) {
				const tk = isTable(task) ? task.kv : {};
				// Who and when for this task, inside the group.
				const tVariants = evaluate(tk.condition, groupPairs, { fixed: ctx.fixed });
				for (const tv of tVariants) {
					let whens = gWhens;
					if (tv.residual) {
						const w = toWhens(tv.residual, names);
						if (w) { whens = [...new Set([...gWhens, ...w.whens])]; if (w.near) report.count("task condition: quest state approximated"); }
						else if (typeof task === "string" || !Object.keys(tk).some((k) => k !== "condition" && k !== "color")) {
							// Text: shown whatever the state.
						} else if (localOnly(tv.residual)) report.count("task condition on the step's location state (kept for all)");
						else { report.count("task condition at runtime Polestar cannot check (kept for all)"); report.note(ctx.name, stepNo, "task condition not carried over", show(tv.residual)); }
					}
					const only = onlyString(onlyFor(tv.pairs, stepPairs)[0].only);
					const c = chunk(whens);
					addTask(task, { c, only, ctx, stepNo, refs, roleNpc, npcPlace, objectPlace, atOf, mapId, setTitle: (t) => { if (!title) title = t; }, eliteTips, format: (f) => { format = Math.max(format, f); }, pairs: tv.pairs, stepPairs, gk, group, merchantHere, trainerOf, wayIn });
				}
			}
		}
	});

	// Waypoints: checkpoints (doors, a search round), and pins without an NPC.
	const path = places.filter((p) => p.flags.includes("C") && !p.npc && !p.object);
	const spots = places.filter((p) => !p.flags.includes("C") && !p.npc && !p.object);
	// Words of a chunk with no goals of its own go with the step's first goals.
	const first = chunks.find((c) => c.goals.length) || chunks[0];
	for (const c of chunks) {
		if (c === first || c.goals.length) continue;
		first.tips.push(...c.tips);
		first.notes.push(...c.notes);
		c.tips = [];
		c.notes = [];
	}

	const steps = [];
	const base = (c) => ({
		stepNo, title: null, only: stepOnly, whens: [...stepWhens, ...c.whens], goals: c.goals, tips: c.tips, notes: c.notes,
		maps: mapId ? [mapId] : [], loop: [], label: null, completesWith: null, allAlong: false, format,
	});
	const gotoOf = (p) => ({ kind: "goto", x: p.x, y: p.y, live: p.live, map: p.uiMap !== mapId ? p.uiMap : undefined, r: p.r > 0 ? p.r : undefined, text: p.label ? bare(p.label).slice(0, 40) : undefined, only: "" });
	for (const c of chunks) {
		// Work begun here and finished in a later step: an along step before this one.
		if (c.along.length) {
			steps.push({ ...base(c), goals: c.along, tips: [], notes: [], title: title ? `${title} (along the way)` : null, completesWith: "next", allAlong: c.along.every((g) => ALONG_KINDS.has(g.kind)) });
			report.count("startwork -> along");
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
			s.goals = [{ kind: "task", text: (s.tips[0] || s.notes[0]).slice(0, 200), only: "" }];
			s.tips = s.tips.slice(1);
			s.format = Math.max(s.format, 5);
			report.count("text-only step -> task");
		}
		s.title = title || (s.tips[0] ? s.tips[0].slice(0, 60) : null);
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
		if (!q) { report.count(`${kind}: quest unknown to the data (dropped)`); report.note(ctx.name, stepNo, `quest ${id} unknown to Polestar's data; ${kind} left out`); return; }
		if (kind === "accept") ctx.seen.add(id);
		t.setTitle(q.title);
		const ends = kind === "accept" ? q.start : q.end;
		if (questEndPlaced(data, ends)) goal({ kind, quest: id, optional });
		else {
			// The giver has no spawn in the data: Journey's own place for them.
			const giver = ((ends && ends.npc) || []).map(npcPlace).find(Boolean) || ((ends && ends.object) || []).map(objectPlace).find(Boolean);
			// Else the last point of the step's way in (a dungeon's or a tram's entrance).
			const place = giver || t.wayIn;
			if (!place) { report.count(`${kind}: giver without a spawn, no place (dropped)`); report.note(ctx.name, stepNo, `quest ${id}: the data has no spawn for its ${kind === "accept" ? "giver" : "ender"} and the step no place; ${kind} left out`); return; }
			goal({ kind, quest: id, optional, at: atOf(place) });
			report.count(giver ? `${kind}: giver without a spawn, placed at Journey's location` : `${kind}: giver without a spawn, placed at the step's way in`);
			if (!giver) report.note(ctx.name, stepNo, `quest ${id}: ${kind} placed at the step's last waypoint (check)`);
		}
		return;
	}
	if (k.complete != null || k.startwork != null) {
		const id = Number(k.complete != null ? k.complete : k.startwork);
		const q = data.quests[id];
		if (!q) { report.count("complete: quest unknown to the data (dropped)"); report.note(ctx.name, stepNo, `quest ${id} unknown to Polestar's data; work left out`); return; }
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
		if (qid && data.quests[qid]) {
			const objs = data.quests[qid].objectives || [];
			const oi = objs.findIndex((o) => o.type === "item" && o.id === item);
			if (oi >= 0) { goal({ kind: "collect", item, itemName, quest: qid, oi: oi + 1, optional: opt }); return; }
		}
		const vendor = roleNpc("vendor");
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
			goal({ kind: "vendor", npc: npc || undefined, optional });
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
		else { report.count(`${kind}: taxi node unknown to the data (dropped)`); report.note(ctx.name, stepNo, `taxi node ${k.learntaxi ?? k.taketaxi} unknown`); }
		return;
	}
	if (k.sethearthstone != null || k.hearth != null) {
		const area = k.sethearthstone != null ? k.sethearthstone : k.hearth;
		const inn = ctx.names.inn(area);
		const kind = k.sethearthstone != null ? "sethome" : "hearth";
		if (inn) { goal({ kind, location: inn, optional }); ctx.bind = inn; report.count(`${k.sethearthstone != null ? "sethearthstone" : "hearth"} -> ${kind}`); }
		else if (kind === "sethome") { goal({ kind, optional }); report.count("sethearthstone: inn of that area unknown -> sethome nearest"); report.note(ctx.name, stepNo, `no inn with area ${area} in the data`); }
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
	if (k.button != null) { report.count("jump button (ignored)"); return; }
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

export function convertGuide(info, guide, data, opts) {
	const { report, slug, packId, names } = opts;
	const faction = info.faction === "Alliance" || info.faction === "Horde" ? info.faction : null;
	const universe = pairsOf(data, faction);
	const ctx = {
		data, names, report, universe, faction, fixed: opts.fixed || {}, name: info.description || info.guideID,
		seen: new Set(opts.before || []), native: opts.native || new Set(), jumps: new Set(), lastMap: Number(info.zone) || null, bind: null,
	};
	// Where the guide's buttons lead on ("Go to 6-12 ..."): its hand-offs, the last
	// one first. A button shown only when the guide is finished counts.
	const jumpFixed = { ...ctx.fixed, COMPLETEONSTART: true, INCOMPLETEONSTART: false };
	for (const st of arr(guide)) {
		if (!isTable(st) || !evaluate(kv(st).condition, universe, { fixed: jumpFixed, local: true }).length) continue;
		for (const g of arr(st)) for (const t of arr(g)) {
			if (!isTable(t) || t.kv.guide == null) continue;
			if (evaluate(t.kv.condition, universe, { fixed: jumpFixed, local: true }).length) ctx.jumps.add(String(t.kv.guide));
		}
	}
	const steps = [];
	arr(guide).forEach((st, i) => {
		if (!isTable(st)) return;
		for (const s of buildStep(st, i + 1, ctx)) steps.push(s);
	});
	// A goal for a quest this guide has not accepted by then: its own step, only
	// while the quest is in the log.
	const accepted = new Set(opts.before || []);
	const out = [];
	for (const s of steps) {
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
		out.push({ ...s, goals: work ? lost : [...rest, ...lost], whens: [...s.whens, `onquest ${ids.join(",")}`], tips: work ? [] : s.tips });
	}

	const title = String(info.description || "").replace(/^\d+-\d+\s+/, "") || info.guideID;
	// A starting guide (from level 1) is for the races Journey recommends it to.
	let races = [];
	if (String(info.levels || "").startsWith("1-") && info.recommended) {
		const set = new Set();
		for (const v of evaluate(info.recommended, universe, { fixed: ctx.fixed })) for (const p of v.pairs) set.add(RACE_NAMES[p.race]);
		if (set.size && set.size < new Set(universe.map((p) => p.race)).size) races = [...set];
	}
	// A guide for some classes only (the catalog's condition).
	const who = evaluate(info.condition, universe, { fixed: ctx.fixed });
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
	const r = render(ir, { report, slug, packId, next: opts.next || [] });
	return { ...r, jumps: [...ctx.jumps].reverse(), accepted };
}
