// The Journey adapter on invented data; no real guide text lives in this repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeSlot, parseLua, parseCatalog } from "../src/journey/parse.mjs";
import { evaluate, toWhens, whenAlts, onlyString, parseExpr, show } from "../src/journey/cond.mjs";
import { convertGuide } from "../src/journey/convert.mjs";
import { Report } from "../src/ir.mjs";

const LUA = `{
	--[[ step:01 ]]
	{
		id = "01-01",
		locations = {
			{ "H|1|50|50|30" },
			{ "CV|1|40|40|5", label = "Leave the hut" },
			{ "|1|45|45", npc = 10 },
		},
		{
			{ "Talk to ", { npc = 10, label = "Bob" }, ":" },
			{ npc = 10 },
			{ accept = 100 },
		},
	},
	{
		id = "01-02",
		condition = "WARRIOR and not WOTLK",
		{ { "Kill ", { npc = 20, label = "boars" }, "." }, { complete = 100, objective = 1 } },
	},
	{
		id = "01-03",
		condition = "TBC",
		{ "Never on Forever", { accept = 101 } },
	},
	{
		id = "01-04",
		{
			buttons = { { destroy = 30 } },
			{ turnin = 100, condition = "QUEST[100] >= COMPLETED" },
			{ merchant = SUPPLIES },
			{ level = 3, xp = 400 },
			{ button = "Next guide", goto = "01-01", guide = "H02X" },
		},
	},
}`;

const html = (text) => `<html><body><p>\n${Buffer.from(text).toString("base64").replace(/(.{60})/g, "$1\n")}\n</p></body></html>`;

// Just enough Polestar data for the guide above.
const DATA = {
	quests: { 100: { id: 100, title: "Boar Trouble", races: null, start: { npc: [10] }, end: { npc: [10] }, objectives: [{ type: "kill", id: 20, count: 5, text: "Boar" }] }, 101: { id: 101, title: "Other", start: { npc: [10] }, end: { npc: [10] }, objectives: [] } },
	npcs: { 10: { id: 10, name: "Bob", spawns: { 1: { f: "l", pts: [[45, 45]] } }, roles: [] }, 20: { id: 20, name: "Boar", rank: 0, spawns: {} } },
	items: { 30: { id: 30, name: "Hearthstone" }, 31: { id: 31, name: "Rune Stone" } },
	objects: {},
	zones: { 1: { name: "Invented Vale" } },
	frames: { forever: { 1: { left: 1000, right: 0, top: 1000, bottom: 0 } }, era: {} },
	races: { Orc: { Horde: { classes: ["WARRIOR", "SHAMAN"] } }, Troll: { Horde: { classes: ["WARRIOR", "PRIEST"] } } },
	inns: [], flights: [],
};
const NAMES = { area: () => null, spell: () => null, wmo: () => null, zone: (id) => (DATA.zones[id] || {}).name || null, inn: () => null, taxi: () => null, levelXp: () => null };
const UNIVERSE = [
	{ cls: "WARRIOR", race: "ORC", faction: "HORDE" }, { cls: "SHAMAN", race: "ORC", faction: "HORDE" },
	{ cls: "WARRIOR", race: "TROLL", faction: "HORDE" }, { cls: "PRIEST", race: "TROLL", faction: "HORDE" },
];

test("decodes a slot and reads the Lua table subset", () => {
	const t = parseLua(decodeSlot(html(LUA)));
	assert.equal(t.arr.length, 4);
	assert.equal(t.arr[0].kv.id, "01-01");
	assert.equal(t.arr[0].kv.locations.arr[1].kv.label, "Leave the hut");
	assert.deepEqual(t.arr[3].arr[0].arr[1].kv, { merchant: { name: "SUPPLIES" } });
	const cat = parseCatalog('{ guideVersion = "1", { guideID = "H01X_FVR", slot = 3, levels = "1-6" }, }');
	assert.deepEqual(cat, [{ guideID: "H01X_FVR", slot: 3, levels: "1-6" }]);
});

test("conditions: Forever names fold, classes and races become only lists", () => {
	const one = (text) => evaluate(text, UNIVERSE).map((v) => onlyString(v.only));
	assert.deepEqual(one("WARRIOR"), ["Warrior"]);
	assert.deepEqual(one("WARRIOR and WOTLK"), []);
	assert.deepEqual(one("ERA and (TROLL or ORC)"), [""]);
	assert.deepEqual(one("not (WARRIOR or PRIEST)"), ["Shaman"]);
	assert.deepEqual(one("WARRIOR and TROLL"), ["Warrior,Troll"]);
	assert.equal(show(parseExpr("not (A or B) and C[1] >= 2")), "not (A or B) and C[1] >= 2");
});

test("runtime state becomes when, where Polestar can check it", () => {
	const res = (text) => evaluate(text, UNIVERSE)[0].residual;
	const w = (text) => toWhens(res(text), NAMES);
	const alts = (text) => whenAlts(res(text), NAMES);
	assert.deepEqual(w("QUEST[5] == NONE"), { whens: ["!onquest 5", "!turnedin 5"] });
	assert.deepEqual(w("QUEST[5] >= TURNEDIN and LEVEL >= 4"), { whens: ["turnedin 5", "level>=4"] });
	assert.deepEqual(w("ITEM[7] == 0"), { whens: ["!has 7"] });
	// "Has or had it": two exclusive copies.
	assert.deepEqual(alts("QUEST[5] >= ACCEPTED").alts, [["onquest 5"], ["turnedin 5", "!onquest 5"]]);
	assert.deepEqual(alts("QUEST[5] == ACCEPTED or LEVEL < 3").alts, [["onquest 5", "!complete 5"], ["level<3"]]);
	// What Polestar cannot check is left out and listed.
	assert.deepEqual(alts("SPELL[99] and LEVEL >= 2"), { alts: [["level>=2"]], unknown: ["SPELL[99]"] });
	assert.deepEqual(alts("not (QUEST[5] >= TURNEDIN or ITEM[7] == 0)").alts, [["!turnedin 5", "has 7"]]);
	// Professions: a tier learnt is rank 1, points are the rank.
	assert.deepEqual(w("FIRSTAID >= APPRENTICE"), { whens: ['skill "First Aid" 1'] });
	assert.deepEqual(w("COOKING_POINTS < 10"), { whens: ["!skill Cooking 10"] });
	assert.deepEqual(alts("FIRSTAID >= JOURNEYMAN").unknown, ["FIRSTAID >= 2"]);
	// The grouping setting, asked per quest; the quest is filled in later.
	const g = (text) => whenAlts(evaluate(text, UNIVERSE, { askGroups: true })[0].residual, NAMES).alts;
	assert.deepEqual(g("GROUPS or LEVEL >= 12"), [["group <quest>"], ["level>=12", "!group <quest>"]]);
	assert.equal(evaluate("GROUPS", UNIVERSE)[0].residual, null);
	// Location state reads as "not yet" for texts and waypoints.
	assert.equal(evaluate("WITHIN[1]", UNIVERSE, { local: true }).length, 0);
});

test("converts an invented guide into Polestar's DSL", () => {
	const guide = parseLua(LUA);
	const report = new Report();
	const r = convertGuide({ guideID: "H01X_FVR", description: "1-6 Invented Vale", faction: "Horde", levels: "1-6", zone: 1, group: "Forever (1-12)" }, guide, DATA, { report, slug: "h01x", packId: "mine", names: NAMES });
	const lines = r.text.split("\n");
	assert.deepEqual(lines.slice(0, 3), ["guide mine/h01x", "title Invented Vale", "faction Horde"]);
	assert.ok(lines.includes("folder Journey Forever (1-12)"));
	// The door on the way out stays, the giver's own pin does not.
	assert.ok(lines.includes('  goto 40,40 "Leave the hut" r 5'));
	assert.ok(lines.includes("  accept 100"));
	assert.ok(lines.includes("  tip Talk to Bob:"));
	// Class step with its objective by the data's numbering.
	assert.match(r.text, /step Kill boars\.\n  only Warrior\n  kill 20 quest 100\.1/);
	// A TBC-only step is gone.
	assert.doesNotMatch(r.text, /accept 101/);
	assert.ok(lines.includes("  destroy 30"));
	assert.ok(lines.includes("  vendor nearest -- resupply: food and drink"));
	assert.doesNotMatch(r.text, /when turnedin 100/);
	assert.ok(lines.includes("  level 3+400"));
	assert.equal(r.format, 5);
	assert.deepEqual(r.jumps, ["H02X"]);
	// The turn-in's own condition: only once the quest is done.
	assert.match(r.text, /when complete 100\n(.*\n)*  turnin 100/);
});

test("open things become manual tasks and notes, and every gap is listed", () => {
	const lua = `{
		{ id = "02-01", { buttons = { { spell = 50 }, { item = 31 } }, { "Do the thing." }, { accept = 100 } } },
		{ id = "02-02", { { button = "I Flew There", goto = "03-01" }, { turnin = 100 } } },
		{ id = "02-03", condition = "SPELL[50]", { "Teleport instead.", { level = 4 } } },
	}`;
	const names = { ...NAMES, spell: (id) => (id === 50 ? "Teleport: Vale" : null) };
	const r = convertGuide({ guideID: "H02X_FVR", description: "2-4 Invented Vale", faction: "Horde", levels: "2-4", zone: 1 }, parseLua(lua), DATA, { report: new Report(), slug: "h02x", packId: "mine", names });
	// A spell to cast: a task the player ticks; an item to use: a note (its quest goal checks).
	assert.match(r.text, /task "Cast Teleport: Vale"/);
	assert.match(r.text, /note "Use Rune Stone"/);
	assert.match(r.text, /note "Choice in Journey: \\"I Flew There\\"\."/);
	// A step only for a state Polestar cannot check: optional, with a note.
	assert.match(r.text, /step Teleport instead\.\n  note "Only if you know Teleport: Vale: otherwise use Skip\."\n  level 4\n/);
	const kinds = new Set(r.gaps.map((g) => g.kind));
	for (const k of ["cast (no goal in Polestar)", "jump the player chooses (note only)", "step for a state Polestar cannot check (note: only if ..., else Skip)"]) assert.ok(kinds.has(k), k);
	assert.ok(r.gaps.every((g) => g.step));
	// No step is left that nothing holds (Polestar would pass it at once).
	for (const step of r.text.split("\n\nstep").slice(1)) assert.match(step, /\n  (?!note)[a-z]+ (?!.*optional)/);
});
