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

test("a forward next with a condition is a skipto on that step, its target labelled", () => {
	const r = conv([
		"step",
		"  talk Giver Bob##201 |only if haveq(5) |next \"C\"",
		"step",
		"  talk Giver Bob##201",
		"step",
		"  collect 3 Wolf Pelt##401",
		"  label \"C\"",
	].join("\n"));
	assert.match(r.text, /^  skipto C when onquest 5$/m);
	assert.match(r.text, /^  label C$/m);
});

test("a repeated label gets its own name, so the along step can name it", () => {
	const r = conv([
		"step",
		"  collect 3 Wolf Pelt##401",
		"  label \"X\"",
		"step",
		"  talk Giver Bob##201 |only if haveq(5) |next \"X\"",
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
