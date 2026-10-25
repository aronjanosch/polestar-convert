// The Zygor converter on invented guide text and a tiny invented data object.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBody } from "../src/zygor/parse.mjs";
import { convertGuide } from "../src/zygor/convert.mjs";
import { Report } from "../src/ir.mjs";

const data = {
	quests: {
		// Giver 203 is placed on the map; the hand-in NPC 201 is not.
		101: { title: "Invented Errand", start: { npc: [203] }, end: { npc: [201] }, level: 3, minLevel: 1,
			objectives: [{ type: "kill", id: 301, text: "Young Wolves" }, { type: "item", id: 401, text: "Wolf Pelts" }] },
		102: { title: "Second Errand", start: { npc: [201] }, end: { npc: [201] }, level: 4, minLevel: 2, objectives: [] },
	},
	npcs: {
		201: { name: "Giver Bob", spawns: {}, rank: 0 },
		203: { name: "Placed Giver", spawns: { 1: { pts: [[30, 70]] } }, rank: 0 },
		301: { name: "Young Wolf", spawns: { 1: { pts: [[40, 40]] } }, rank: 0 },
	},
	items: { 401: { name: "Wolf Pelt", drops: { npc: { 301: 50 } } }, 402: { name: "Old Rag", drops: {} } },
	zones: { 1: { name: "Invented Vale" } },
	frames: { forever: { 1: { left: 100, right: 0, top: 100, bottom: 0 } }, era: {} },
	races: null, objects: {}, inns: [], flights: [], journal: new Map(), hasProfessions: false,
};

const conv = (body, header = { condition_suggested: "function() return raceclass('Scourge') and level <= 4 end" }) => {
	const report = new Report();
	const r = convertGuide({ name: "Leveling Guides\\Invented Vale (1-4)", header, steps: parseBody(body) }, data,
		{ report, slug: "vale", packId: "mine", next: [], faction: "Horde" });
	return { ...r, report };
};

test("accept at a giver the data places has no @; a hand-in the data does not place takes the goto", () => {
	const r = conv([
		"step",
		"  accept Invented Errand##101 |goto Invented Vale/0 30.2,71.7",
		"step",
		"  turnin Invented Errand##101 |goto Invented Vale/0 30.2,71.7",
	].join("\n"));
	assert.match(r.text, /^  accept 101$/m);
	assert.match(r.text, /^  turnin 101 @30.2,71.7$/m);
});

test("a kill with a quest objective becomes `kill <npc> quest Q.N`", () => {
	const r = conv("step\n  kill 8 Young Wolf##301 |q 101/1 |goto Invented Vale 40,40]\n");
	assert.match(r.text, /^  kill 301 quest 101\.1$/m);
});

test("a 'Click Here to Continue' line is a task; a dungeon-choice confirm step is gone", () => {
	const r = conv([
		"step",
		"  Click Here to Continue |confirm",
		"step",
		"  Click Here to Run Ragefire Chasm Dungeon |confirm RFCflag",
	].join("\n"));
	assert.match(r.text, /^  task "Click Here to Continue"$/m); // nothing else to name it
	assert.doesNotMatch(r.text, /Ragefire/);
	assert.equal(r.stepsOut, 1);
});

test("a step for hardcore only is gone; `not hardcore()` keeps the step without a condition", () => {
	const r = conv([
		"step",
		"  collect 3 Wolf Pelt##401",
		"  |only if hardcore()",
		"step",
		"  collect 3 Wolf Pelt##401",
		"  |only if not hardcore()",
	].join("\n"));
	assert.equal(r.stepsOut, 1);
	assert.doesNotMatch(r.text, /only/);
});

test("a sticky name used twice binds each start to the next label after it", () => {
	const r = conv([
		"step",
		"  accept Invented Errand##101",
		"stickystart \"A\"",
		"step",
		"  talk Giver Bob##201",
		"step",
		"  kill 8 Young Wolf##301 |q 101/1",
		"  label \"A\"",
		"stickystart \"A\"",
		"step",
		"  talk Giver Bob##201",
		"step",
		"  collect 3 Wolf Pelt##401",
		"  label \"A\"",
	].join("\n"));
	assert.match(r.text, /^  along until A\n  kill 301 quest 101\.1$/m);
	assert.match(r.text, /^  along until A-2\n  collect 401 x3$/m);
	assert.match(r.text, /^  label A$/m);
	assert.match(r.text, /^  label A-2$/m);
});

test("a sticky stop before a step ends the along copy at that step", () => {
	const r = conv([
		"step",
		"  accept Invented Errand##101",
		"stickystart \"S\"",
		"step",
		"  kill 8 Young Wolf##301 |q 101/1",
		"stickystop \"S\"",
		"step",
		"  talk Giver Bob##201",
		"step",
		"  kill 8 Young Wolf##301 |q 101/1",
		"  label \"S\"",
	].join("\n"));
	assert.match(r.text, /^  along until S-stop\n  kill 301 quest 101\.1$/m);
	assert.match(r.text, /^  label S-stop$/m);
});

test("a class-only collect inside a sticky keeps its only in the along copy", () => {
	const r = conv([
		"step",
		"  accept Invented Errand##101",
		"stickystart \"A\"",
		"step",
		"  talk Giver Bob##201",
		"step",
		"  collect 3 Wolf Pelt##401 |only Warlock",
		"  label \"A\"",
	].join("\n"));
	assert.match(r.text, /^  along until A\n  collect 401 x3 only Warlock$/m);
});

test("a guideflag step is `when dungeon` for that dungeon", () => {
	const r = conv([
		"step",
		"  |only if guideflag(\"Maraflag\")",
		"  Enter Maraudon",
		"step",
		"  collect 3 Wolf Pelt##401",
	].join("\n"));
	assert.match(r.text, /^  when dungeon "Maraudon"$/m);
});

test("a forward next on a goal line jumps from the next step once the goal's step is done, its target labelled", () => {
	const r = conv([
		"step",
		"  talk Giver Bob##201 |only if haveq(5) |next \"C\"",
		"step",
		"  talk Giver Bob##201",
		"step",
		"  collect 3 Wolf Pelt##401",
		"  label \"C\"",
	].join("\n"));
	assert.match(r.text, /step\n  when onquest 5\n  label (\S+)\n  talk 201\n\nstep\n  skipto C when done \1\n  talk 201/);
	assert.match(r.text, /^  label C$/m);
});

test("a repeated label gets its own name, so the along step can name it", () => {
	const r = conv([
		"step",
		"  collect 3 Wolf Pelt##401",
		"  label \"X\"",
		"step",
		"  Example Way |confirm |only if haveq(5)",
		"  '|complete haveq(5) |next \"X\"",
		"step",
		"  talk Giver Bob##201",
		"step",
		"  collect 3 Wolf Pelt##401",
		"  label \"X\"",
	].join("\n"));
	assert.match(r.text, /^  skipto X-2 when onquest 5$/m);
	assert.match(r.text, /^  label X-2$/m);
	assert.doesNotMatch(r.text, /^  skipto X when/m);
});

test("ding N,xp is a level goal", () => {
	const r = conv("step\n  ding 3,1000\n");
	assert.match(r.text, /^  level 3\+1000$/m);
});

test("trash is a destroy goal; a text-only step is a task with its text", () => {
	const r = conv([
		"step",
		"  trash Old Rag##402",
		"step",
		"  Read the letter",
	].join("\n"));
	assert.match(r.text, /^  destroy 402$/m);
	assert.match(r.text, /^  task "Read the letter"$/m);
});

test("a talk to the giver of an accept in the same step is dropped", () => {
	const r = conv("step\n  talk Giver Bob##201\n  accept Invented Errand##101\n");
	assert.doesNotMatch(r.text, /^  talk /m);
	assert.match(r.text, /^  accept 101$/m);
});

test("a race the guide is not for drops the step", () => {
	const r = conv([
		"step",
		"  |only if not Undead",
		"  Wrong race",
		"step",
		"  collect 3 Wolf Pelt##401",
	].join("\n"));
	assert.equal(r.stepsOut, 1);
	assert.doesNotMatch(r.text, /Wrong race/);
});

test("a NOTE heading names the task of a 'Click Here to Continue' step, not the click", () => {
	const r = conv([
		"step",
		"  _NOTE:_",
		"  Mind Your Arrows",
		"  |tip Buy more.",
		"  Click Here to Continue |confirm",
	].join("\n"));
	assert.match(r.text, /^  task "Mind Your Arrows"$/m);
	assert.doesNotMatch(r.text, /NOTE|Click Here/);
});

test("a confirm after a kill line ticks the kill, not the click", () => {
	const r = conv([
		"step",
		"  kill Young Wolf##301+",
		"  Click to Continue |confirm |goto Invented Vale/0 40,40",
	].join("\n"));
	assert.match(r.text, /^  task "Kill Young Wolf" @40,40$/m);
});

test("the text of a vendor or trainer line is not repeated as a tip; a kill line beside a collect is not either", () => {
	const r = conv([
		"step",
		"  talk Giver Bob##201",
		"  Sell Items |vendor Giver Bob##201 |goto Invented Vale/0 30,70",
		"step",
		"  accept Invented Errand##101",
		"step",
		"  kill Young Wolf##301",
		"  collect Wolf Pelt##401 |q 101/2",
	].join("\n"));
	assert.doesNotMatch(r.text, /tip (Sell Items|Kill Young Wolf)/);
	assert.match(r.text, /^  vendor 201$/m);
});

test("a text line with a quest objective is that objective's goal; a heading ending in ':' names nothing", () => {
	const r = conv([
		"step",
		"  accept Invented Errand##101 |goto Invented Vale/0 30,70",
		"step",
		"  _Inside the Den:_",
		"  use Old Rag##402",
		"  Round Up #8# Wolves |q 101/1",
	].join("\n"));
	assert.match(r.text, /^  kill 301 quest 101\.1$/m);
	assert.doesNotMatch(r.text, /task "Inside the Den:"/);
});

test("a giver the data places nowhere, with no goto of its own, takes the last point of the route", () => {
	const r = conv([
		"step",
		"  Enter the Den |goto Invented Vale/0 76.5,51.1",
		"step",
		"  talk Giver Bob##201",
		"  turnin Invented Errand##101",
	].join("\n"));
	assert.match(r.text, /^  turnin 101 @76\.5,51\.1$/m);
});

test("in an |or step a kill on the way does not hold it; the way does", () => {
	const r = conv([
		"step",
		"  accept Invented Errand##101",
		"step",
		"  kill 8 Young Wolf##301 |q 101/1 |goto Invented Vale/0 40,40 |or",
		"  Enter the Den |complete subzone(\"The Den\") |or",
	].join("\n"));
	assert.match(r.text, /^  kill 301 quest 101\.1 optional$/m);
	// Zygor also writes the way as a `'|complete` line after a tip.
	const r2 = conv(["step", "  accept Invented Errand##101", "step",
		"  kill 8 Young Wolf##301 |q 101/1 |goto Invented Vale/0 40,40 |or", "  |tip On the way.", "  '|complete subzone(\"The Den\") |or"].join("\n"));
	assert.match(r2.text, /^  kill 301 quest 101\.1 optional$/m);
	assert.match(r.text, /^  enter "The Den"$/m);
});

test("a collect for a quest not taken yet (|future) is a bag count at its goto, not the objective", () => {
	const r = conv([
		"step",
		"  collect 3 Wolf Pelt##401 |goto Invented Vale/0 39.6,41.9 |q 101 |future",
	].join("\n"));
	assert.match(r.text, /^  collect 401 x3 @39\.6,41\.9$/m);
	assert.doesNotMatch(r.text, /when onquest/);
});

test("a buy of an item no vendor sells (the auction house) is a bag count at its point", () => {
	const r = conv([
		"step",
		"  buy Old Rag##402 |goto Invented Vale/0 53.6,59.7 |q 101 |future",
	].join("\n"));
	assert.match(r.text, /^  collect 402 x1 @53\.6,59\.7$/m);
	assert.doesNotMatch(r.text, /buy 402/);
});

test("an |only that does not open its line is that line's: a hardcore tip drops the tip, not the step", () => {
	const r = conv([
		"step",
		"  accept Invented Errand##101 |goto Invented Vale/0 30.2,71.7",
		"step",
		"  kill 8 Young Wolf##301 |q 101/1",
		"  |tip Watch for respawns. |only if hardcore",
		"step",
		"  kill 8 Young Wolf##301 |q 101/1",
		"  |only if hardcore",
	].join("\n"));
	assert.equal(r.stepsOut, 2);
	assert.match(r.text, /^  kill 301 quest 101\.1$/m);
	assert.doesNotMatch(r.text, /respawns/);
});

test("a |next on a goal line jumps once its step is done, never at once; on a turn-in once handed in", () => {
	const r = conv([
		"step",
		"  accept Invented Errand##101 |goto Invented Vale/0 30.2,71.7",
		"step",
		"  collect 3 Wolf Pelt##401 |q 101/2 |next \"done\" |or",
		"step",
		"  collect 3 Wolf Pelt##401 |q 101/2",
		"step",
		"  label \"done\"",
		"  turnin Invented Errand##101 |goto Invented Vale/0 30.2,71.7",
	].join("\n"));
	assert.match(r.text, /label (\S+)\n  collect 401 quest 101\.2\n\nstep\n  skipto done when done \1\n/);
	assert.doesNotMatch(r.text, /level>=1/);
	const t = conv(["step", "  accept Invented Errand##101", "step", "  turnin Invented Errand##101 |next \"L\"", "step", "  talk Giver Bob##201",
		"step", "  label \"L\"", "  talk Placed Giver##203"].join("\n"));
	assert.match(t.text, /turnin 101\n\nstep\n  skipto L when turnedin 101\n  talk 201/);
});

test("a goal's point on another map than the step's zone names its map", () => {
	const d2 = { ...data, zones: { ...data.zones, 2: { name: "Other Fen" } }, frames: { ...data.frames, forever: { ...data.frames.forever, 2: { left: 100, right: 0, top: 100, bottom: 0 } } } };
	const report = new Report();
	const r = convertGuide({ name: "Leveling Guides\\Invented Vale (1-4)", header: {}, steps: parseBody([
		"step",
		"  Follow the path |goto Invented Vale 32.7,27.1 < 20",
		"  Jump to Your Death |complete isdead |goto Other Fen 11.7,43.3",
	].join("\n")) }, d2, { report, slug: "vale", packId: "mine", next: [], faction: "Horde" });
	assert.match(r.text, /^  task "Jump to Your Death" @11\.7,43\.3 map 2$/m);
});

test("display lines read as Zygor shows them: verb named, no + marker, no map link, no name-as-id", () => {
	const r = conv([
		"step",
		"  accept Invented Errand##101 |goto Invented Vale/0 30.2,71.7",
		"  click Example Mushroom+",
		"  use Old Rag##402",
		"  talk Exampler##Exampler",
		"  Buy a mount nearby at [Invented Vale/0 59.87,52.68]",
	].join("\n"));
	assert.match(r.text, /^  tip Click Example Mushroom$/m);
	assert.match(r.text, /^  tip Use Old Rag$/m);
	assert.match(r.text, /^  tip Exampler$/m);
	assert.match(r.text, /^  tip Buy a mount nearby at Invented Vale 59\.87,52\.68$/m);
});

test("a class line that is a task is not also its note", () => {
	const r = conv([
		"step",
		"  Train Staves |complete weaponskill(\"TH_STAFF\") > 0 |goto Invented Vale/0 57.1,57.7 |only if Priest",
		"  Train Daggers |complete weaponskill(\"DAGGER\") > 0 |goto Invented Vale/0 57.1,57.7 |only if Mage",
	].join("\n"));
	assert.match(r.text, /^  task "Train Staves" @57\.1,57\.7 only Priest$/m);
	assert.doesNotMatch(r.text, /note "Train/);
});

test("turninany turns in each quest; one the guide does not take waits for it in the log", () => {
	const r = conv([
		"step",
		"  accept Invented Errand##101 |goto Invented Vale/0 30.2,71.7",
		"step",
		"  turninany Errands##101,102 |goto Invented Vale/0 30.2,71.7",
	].join("\n"));
	assert.match(r.text, /^  turnin 101 @30\.2,71\.7$/m);
	assert.match(r.text, /when onquest 102\n(  .*\n)*  turnin 102/);
	assert.doesNotMatch(r.text, /101,102/);
});

test("training a profession (|skillmax Prof,75) is Polestar's `train <Profession>`", () => {
	const r = conv([
		"step",
		"  talk Giver Bob##201",
		"  Train Apprentice Mining |skillmax Mining,75 |goto Invented Vale/0 50.1,50.2",
		"step",
		"  Learn First Aid |skillmax First Aid,75",
	].join("\n"));
	assert.match(r.text, /^  train Mining Apprentice npc 201$/m); // the trainer the step talks to
	assert.match(r.text, /^  train First Aid Apprentice$/m);
	assert.doesNotMatch(r.text, /talk 201|Train Apprentice/);
});

test("a turn-in of a quest accepted only under a condition waits for it in the log", () => {
	const r = conv([
		"step",
		"  accept Invented Errand##101 |goto Invented Vale/0 30.2,71.7",
		"  |only if itemcount(402) > 0",
		"step",
		"  turnin Invented Errand##101 |goto Invented Vale/0 30.2,71.7",
	].join("\n"));
	assert.match(r.text, /when onquest 101\n(  .*\n)*  turnin 101/);
});

test("a way line alone is a goto that holds until arrival, not a task to tick", () => {
	const r = conv("step\n  Leave the cave |goto Invented Vale/0 47.5,46.4 < 15 |walk\n");
	assert.match(r.text, /^  goto 47\.5,46\.4 "Leave the cave" map 1$/m);
	assert.doesNotMatch(r.text, /task "Leave the cave"|optional/);
});

test("a way line for some places only is a goto step of its own before its step, holding the condition", () => {
	const r = conv([
		"step",
		"  Leave the cave |goto Invented Vale/0 47.5,46.4 < 15 |walk |only if subzone(\"Invented Cave\") and indoors()",
		"  Follow the path |goto 50,50 < 15 |only if walking and not subzone(\"Invented Camp\")",
		"  turnin Invented Errand##101 |goto Invented Vale/0 30.2,71.7",
	].join("\n"));
	assert.match(r.text, /step\n  when subzone "Invented Cave"\n  goto 47\.5,46\.4 "Leave the cave" map 1\n\nstep\n  when !subzone "Invented Camp"\n  goto 50,50 "Follow the path" map 1\n\nstep\n(  when onquest 101\n)?  turnin 101/);
	assert.equal(r.gaps.length, 0);
});

test("a line with a quest objective is never a way line", () => {
	const r = conv("step\n  Invented Errand Done |q 102/1 |goto Invented Vale/0 40,40 |only if haveq(102)\n  talk Giver Bob##201\n");
	assert.doesNotMatch(r.text, /goto 40,40/);
});

test("an OR of predicates is a copy of the step per alternative, none overlapping", () => {
	const r = conv([
		"step",
		"  accept Invented Errand##101 |goto Invented Vale/0 30.2,71.7",
		"step",
		"  accept Second Errand##102 |goto Invented Vale/0 30.2,71.7",
		"  |only if haveq(101) or completedq(101)",
	].join("\n"));
	assert.match(r.text, /step\n  when onquest 101\n  accept 102 @30\.2,71\.7\n\nstep\n  when turnedin 101\n  accept 102 @30\.2,71\.7\n/);
	assert.equal(r.gaps.length, 0);
});

test("goal lines under different conditions are a step each, in order", () => {
	const r = conv([
		"step",
		"  accept Invented Errand##101 |goto Invented Vale/0 30.2,71.7",
		"step",
		"  talk Giver Bob##201",
		"  turnin Invented Errand##101 |goto Invented Vale/0 30.2,71.7 |only if readyq(101)",
		"  accept Second Errand##102 |goto Invented Vale/0 30.2,71.7",
	].join("\n"));
	assert.match(r.text, /step\n  when complete 101\n  turnin 101 @30\.2,71\.7\n\nstep\n  accept 102/);
	assert.equal(r.gaps.length, 0);
});

test("`|only if itemcount(I) < N` beside a collect of N of I says nothing more; copies that cannot hold are left out", () => {
	const r = conv([
		"step",
		"  collect 3 Wolf Pelt##401 |only if itemcount(401) < 3",
		"  collect 2 Old Rag##402 |only if itemcount(402) < 2",
		"  |only if itemcount(401) < 3 or itemcount(402) < 2",
	].join("\n"));
	assert.doesNotMatch(r.text, /when/);
	assert.match(r.text, /collect 401 x3\n  collect 402 x2/);
});

test("discountgold is money>= the full price", () => {
	const r = conv("step\n  talk Giver Bob##201\n  |only if Undead and discountgold('Undercity',350)\n");
	assert.match(r.text, /when money>=350/);
	assert.equal(r.gaps.length, 0);
});

test("a profession: rank trained, recipe learned at the trainer, skill reached; materials only while the skill is short", () => {
	const r = conv([
		"step",
		"  talk Giver Bob##201",
		"  Train Journeyman Tailoring |skillmax Tailoring,150",
		"step",
		"  talk Giver Bob##201",
		"  Train Example Shirt |learn Example Shirt##9001",
		"step",
		"  collect 20 Old Rag##402 |or",
		"  |tip Or buy them.",
		"  '|complete skill(\"Tailoring\") >= 80 |or",
		"step",
		"  _<Create 10 Example Shirts>_",
		"  Reach Skill 80 in Tailoring |skill Tailoring,80",
	].join("\n"));
	assert.match(r.text, /^  train Tailoring Journeyman npc 201$/m);
	assert.match(r.text, /^  learn 9001 "Example Shirt" npc 201$/m);
	assert.doesNotMatch(r.text, /talk 201/);
	assert.match(r.text, /step\n  when !skill Tailoring 80\n  tip Or buy them\.\n  collect 402 x20\n/);
	assert.match(r.text, /tip Create 10 Example Shirts\n  skill "Tailoring" 80/);
});

test("a trainer picked by distance is left to Polestar's nearest", () => {
	const r = conv([
		"step",
		"  talk Giver Bob##201 |goto Invented Vale/0 10,10 |only if dist(\"Invented Vale/0 10,10\") < 500",
		"  talk Placed Giver##203 |goto Invented Vale/0 30,70 |only if default",
		"  Train Apprentice Mining |skillmax Mining,75",
	].join("\n"));
	assert.match(r.text, /^  train Mining Apprentice$/m);
	assert.doesNotMatch(r.text, /talk|npc/);
	assert.equal(r.gaps.length, 0);
});

test("a gathering route is a loop where the step collects; beside a skill only its first point", () => {
	const r = conv([
		"step",
		"  map Invented Vale",
		"  path follow smart; loop on",
		"  path 10,10 20,20 30,30",
		"  Click herbs along the path",
		"  collect Wolf Pelt##401 |n",
		"  '|confirm",
		"step",
		"  map Invented Vale",
		"  path 40,40 50,50",
		"  Reach Skill 75 in Herbalism |skill Herbalism,75",
	].join("\n"));
	assert.match(r.text, /  loop\n  goto 10,10\n  goto 20,20\n  goto 30,30\n  collect 401 x1 optional\n  task "Click herbs along the path"/);
	assert.match(r.text, /goto 40,40 map 1 optional\n  skill "Herbalism" 75/);
});

test("a menu is a step per option; the step after a ticked option jumps to its label", () => {
	const r = conv([
		"step",
		"  Choose one:",
		"  Option A |confirm |next \"A\"",
		"  Option B |confirm |next \"B\"",
		"step",
		"  label \"A\"",
		"  talk Giver Bob##201",
		"step",
		"  label \"B\"",
		"  talk Placed Giver##203",
	].join("\n"));
	assert.match(r.text, /step\n  label (\S+)\n  tip Choose one:\n  task "Option A"\n\nstep\n(  label \S+\n)?  tip Choose one:\n  skipto A when done \1\n  task "Option B"/);
	assert.match(r.text, /label B/);
});

test("a jump without a condition is taken once its step is done", () => {
	const r = conv([
		"step",
		"  talk Giver Bob##201",
		"  |next \"Later\"",
		"step",
		"  talk Placed Giver##203",
		"step",
		"  label \"Later\"",
		"  Example task |confirm",
	].join("\n"));
	assert.match(r.text, /step\n  label (\S+)\n  talk 201\n\nstep\n  skipto Later when done \1\n  talk 203/);
});

test("entering a dungeon on its own map is an enter goal", () => {
	const r = conv("step\n  Enter the Invented Hollow Dungeon with Your Group |goto Invented Hollow/0 0.00,0.00 < 500 |c\n");
	assert.match(r.text, /^  enter "Invented Hollow"$/m);
});

test("a jump on a check Polestar cannot ask is dropped, not taken; the check as another way to end the step goes too", () => {
	const r = conv([
		"step",
		"  Read This First |confirm |or",
		"  '|complete rep('Invented Circle') == Exalted |next \"End\" |or",
		"step",
		"  talk Giver Bob##201",
		"step",
		"  label \"End\"",
		"  talk Placed Giver##203",
	].join("\n"));
	assert.doesNotMatch(r.text, /skipto|rep /);
	assert.match(r.text, /task "Read This First"/);
	assert.ok(r.gaps.some((g) => /jump to "End"/.test(g.what)));
});

test("a jump per item held: one skipto per check line", () => {
	const r = conv([
		"step",
		"  Farm Example Notes |confirm |or",
		"  '|complete itemcount(401) >= 1 |next \"A\" |or",
		"  '|complete itemcount(402) >= 1 |next \"B\" |or",
		"step",
		"  label \"A\"",
		"  talk Giver Bob##201",
		"step",
		"  label \"B\"",
		"  talk Placed Giver##203",
	].join("\n"));
	// A is the next step anyway; the checks are the jumps', not the step's.
	assert.match(r.text, /step\n  skipto B when has 402\n  task "Farm Example Notes"/);
});

test("trainers per race: a train per trainer for its races", () => {
	const r = conv([
		"step",
		"  talk Giver Bob##201 |only if Undead",
		"  talk Placed Giver##203 |only if Orc",
		"  Train Apprentice Mining |skillmax Mining,75",
	].join("\n"), { condition_suggested: "" });
	assert.match(r.text, /train Mining Apprentice npc 201 only Undead\n  train Mining Apprentice npc 203 only Orc/);
	assert.doesNotMatch(r.text, /talk/);
});

test("abandon, cast, a use alone, a standing reached and a check on a goal line", () => {
	const r = conv([
		"step",
		"  accept Invented Errand##101",
		"step",
		"  Abandon Invented Errand |complete not haveq(101)",
		"step",
		"  cast Example Spell##9002",
		"step",
		"  use Old Rag##402",
		"step",
		"  accept Second Errand##102 |complete completedq(102) or completedq(101)",
	].join("\n"));
	assert.match(r.text, /^  abandon 101$/m);
	assert.match(r.text, /^  cast 9002 "Example Spell"$/m);
	assert.match(r.text, /^  use 402$/m);
	assert.match(r.text, /when !turnedin 102\n  when !turnedin 101\n  accept 102/);
});

test("a guide's levels from its suggested range when its name has none", () => {
	const report = new Report();
	const r = convertGuide({ name: "Dungeon Guides\\Invented Hollow Quests", header: { condition_suggested: "function() return level >= 15 and level <= 25 end" }, steps: parseBody("step\n  talk Giver Bob##201\n") }, data,
		{ report, slug: "hollow", packId: "mine", next: [], faction: "Horde", category: "Dungeons" });
	assert.match(r.text, /^levels 15-25$/m);
	assert.match(r.text, /^category Dungeons$/m);
});
