// The intermediate form every adapter (RXP today, Journey and Zygor later)
// produces and `emit.mjs` turns into Polestar `.guide` text. An adapter reads
// its source format and the Polestar data; the renderer knows only Polestar's
// DSL. Nothing here knows about RXP.
//
// Guide = {
//   name,                   // for report lines
//   title, faction?, classes?, races?, levels?, zone?, defaultMap?, category?, folder?,
//   next?                   // slug of the following guide, set by the CLI
//   steps: [Step],
// }
// Step = {
//   stepNo,                 // position in the source, for report lines
//   title?, only: {class?, race?, faction?}, whens: ["level>=5", ...],
//   goals: [Goal], tips: [text], notes: [text],
//   maps: [uiMapID],        // maps its goals sit on; the first becomes `zone map`
//   loop: [{x, y, live}],   // spawn area points of a grind step; [] when none
//   label?,                 // name other steps can wait for
//   completesWith?,         // "next" or a label: the step is optional until then
//   allAlong,               // its goals are all work done along the way
//   format,                 // lowest pack format its goals need
// }
// Goal = { kind, only: "Warrior,Priest" | "", optional?, ...fields } with `kind` one of
//   accept/turnin {quest, title?, at?, item? (accept: started from it)}   complete {quest, title?, at?}
//   kill {npc, quest, oi}  collect {item, itemName?, quest?, oi?, count?}
//   interact {object, quest, oi}  buy {item, itemName?, count, npc?}  (no npc: nearest)
//   vendor {npc?}  train {npc?|class|profession, comment?}  use {item}
//   level {level, xp?}  skill {skill, n}  task {text}  note {text}
//   abandon {quest}  destroy {item}  goto {x, y, live, text?}
// `at` = {x, y, live, map?}: where the goal is, when the data does not know; `map`
// when it is not the step's zone.

export function q(text) { return `"${String(text).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`; }
export function bare(text) { return String(text).replace(/"/g, "'"); }

const atText = (at) => (at ? ` @${at.x},${at.y}${at.map != null ? " map " + at.map : ""}${at.live ? "" : " era"}` : "");
const nameText = (g) => (g.itemName ? ` ${q(g.itemName)}` : "");

// A goal's text without `only`/`optional`, and its trailing `-- comment`.
export function goalText(g) {
	switch (g.kind) {
		case "accept": case "turnin": case "complete":
			return `${g.kind} ${g.quest}${g.title ? " " + q(g.title) : ""}${atText(g.at)}${g.item ? " item " + g.item : ""}`;
		case "kill": return `kill ${g.npc} quest ${g.quest}.${g.oi}`;
		case "interact": return `interact ${g.object} quest ${g.quest}.${g.oi}`;
		case "collect":
			if (g.quest != null && g.oi != null) return `collect ${g.item}${nameText(g)} quest ${g.quest}.${g.oi}`;
			return `collect ${g.item}${nameText(g)} x${g.count || 1}`;
		case "buy": return `buy ${g.item}${nameText(g)} x${g.count || 1} ${g.npc ? "npc " + g.npc : "nearest"}`;
		case "vendor": return g.npc ? `vendor ${g.npc}` : "vendor nearest";
		case "train":
			if (g.profession) return `train ${g.profession.includes(" ") ? q(g.profession) : g.profession}${g.npc ? " npc " + g.npc : ""}`;
			if (g.class) return "train class";
			return `train ${g.npc}`;
		case "use": return `use ${g.item}`;
		case "level": return `level ${g.level}${g.xp != null ? "+" + g.xp : ""}`;
		case "skill": return `skill ${q(g.skill)} ${g.n}`;
		case "task": case "note": return `${g.kind} ${q(g.text)}`;
		case "abandon": return `abandon ${g.quest}`;
		case "destroy": return `destroy ${g.item}`;
		case "goto": return `goto ${g.x},${g.y}${g.live ? "" : " era"}${g.text ? " " + q(g.text) : ""}`;
		default: throw new Error(`unknown goal kind ${g.kind}`);
	}
}

// The quest a goal depends on being in the log (turn-in, complete, objectives), or null.
export function questOf(g) {
	return ["turnin", "complete", "kill", "collect", "interact"].includes(g.kind) && g.quest != null ? g.quest : null;
}

export class Report {
	constructor() { this.counts = new Map(); this.items = []; }
	count(key, n = 1) { this.counts.set(key, (this.counts.get(key) || 0) + n); }
	note(guide, stepNo, what, line) { this.items.push({ guide, stepNo, what, line }); }
}
