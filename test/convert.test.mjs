// The RXP adapter's helpers that need no Polestar data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGuide } from "../src/rxp/parse.mjs";
import { skillWhen, spellNames, moneyWhen, cooldownWhen, convertGuide, friendlyKillText, headerRaces } from "../src/rxp/convert.mjs";
import { goalText, Report } from "../src/ir.mjs";
import { innNamed } from "../src/data.mjs";

test("RXP's skill skip form becomes a when skill", () => {
	assert.equal(skillWhen("cooking,50,1"), "!skill Cooking 50");
	assert.equal(skillWhen("firstaid,<1,1"), 'skill "First Aid" 1');
	assert.equal(skillWhen("herbalism, <75, 1"), "skill Herbalism 75");
	assert.equal(skillWhen("riding,75,1"), null);
	assert.equal(skillWhen("cooking,50"), null);
	assert.equal(skillWhen("cooking,50,0"), null);
});

test("spell names come from the lines that cast them", () => {
	const g = parseGuide([
		"step",
		"    .cast 18960 >>|cRXP_WARN_Cast|r |T135758:0|t[Teleport: Moonglade]",
		"    .cast 818 >>Cast Basic Campfire.",
		"    .usespell 1308247 >>Eat |T1:0|t[|cRXP_LOOT_Odd Flesh|r]",
		"    .usespell 2550",
		"    .cast 1,2 >>|T1:0|t[Two Spells]",
	].join("\n"));
	const names = spellNames([g]);
	assert.equal(names.get(18960), "Teleport: Moonglade");
	assert.equal(names.get(818), "Basic Campfire");
	assert.equal(names.get(1308247), "Odd Flesh");
	assert.equal(names.has(2550), false);
	assert.equal(names.has(1), false);
	assert.equal(goalText({ kind: "cast", spell: 818, name: "Basic Campfire" }), 'cast 818 "Basic Campfire"');
});

test("RXP's money skip form becomes a when money, in copper", () => {
	assert.equal(moneyWhen("<0.1"), "money>=1000");
	assert.equal(moneyWhen(">1.5"), "money<15000");
	assert.equal(moneyWhen(" <2 "), "money>=20000");
	assert.equal(moneyWhen("5"), null);
});

test("RXP's cooldown skip form becomes a when cooldown up to RXP's 2 seconds", () => {
	assert.equal(cooldownWhen("item,6948,>0,1"), "!cooldown item 6948");
	assert.equal(cooldownWhen("item,6948,<0"), "cooldown item 6948");
	assert.equal(cooldownWhen("item,6948,>2,1"), "!cooldown item 6948");
	assert.equal(cooldownWhen("spell,1259416,>0,1"), "!cooldown spell 1259416");
	assert.equal(cooldownWhen("item,6948,<600"), null);
});

// A small world: two weapon masters, a smith who sells and does not train, a vendor named by first name.
function fakeData() {
	const npcs = {
		1: { id: 1, name: "Bixi", roles: ["trainer"], spawns: {} },
		2: { id: 2, name: "Buliwyf", roles: ["trainer"], spawns: {} },
		3: { id: 3, name: "Grundel", roles: ["vendor"], spawns: {} },
		4: { id: 4, name: "Oliver Dwor", roles: ["vendor"], spawns: { 1: { pts: [[1, 1]] } } },
		5: { id: 5, name: "Oliver", spawns: {} },
	};
	const items = { 10: { id: 10, name: "Stiletto", vendors: [4] } };
	const npcByName = new Map();
	for (const n of Object.values(npcs)) npcByName.set(n.name.toLowerCase(), [...(npcByName.get(n.name.toLowerCase()) || []), n]);
	return { quests: {}, npcs, zones: {}, frames: {}, items, races: {}, objects: {}, journal: new Map(), inns: [], flights: [], hasProfessions: false, npcByName };
}
const guideText = (body) => convertGuide(parseGuide("#name T\n" + body), fakeData(), { report: new Report(), slug: "t", packId: "chk" });
const goalsOf = (out) => String(out.text || out).split("\n").map((l) => l.trim()).filter((l) => /^(train|buy|vendor|task|note|when)\b/.test(l));

test("two trainers: each .train takes the target written beside it", () => {
	const out = guideText(["step", "    .train 1,1 >> Train Thrown", "    .target +Bixi", "    .train 2,1 >> Train 2h Maces", "    .target +Buliwyf"].join("\n"));
	assert.deepEqual(goalsOf(out), ["train 1 -- Train Thrown", "train 2 -- Train 2h Maces"]);
});

test("a target without the trainer role is no trainer: train class", () => {
	const out = guideText(["step << Warrior", "    .train 6673 >> Train Battle Shout", "    .target Grundel"].join("\n"));
	assert.deepEqual(goalsOf(out), ["train class only Warrior -- Train Battle Shout"]);
});

test(".trainer is a train goal at the step's trainer", () => {
	const out = guideText(["step", "    .trainer >> Train your class spells", "    .target Bixi"].join("\n"));
	assert.deepEqual(goalsOf(out), ["train 1 -- Train your class spells"]);
});

test("a buy takes the vendor the text names by first name, and .vendor <id> with a buy text buys", () => {
	const out = guideText(["step", ">>|cRXP_BUY_Talk to|r |cRXP_FRIENDLY_Oliver|r|cRXP_BUY_. Buy a|r [Stiletto]", "    .collect 10,1,5,1 --Stiletto (1)"].join("\n"));
	assert.deepEqual(goalsOf(out), ["buy 10 x1 npc 4"]);
	const out2 = guideText(["step", "    .vendor 4 >> |cRXP_BUY_Buy a|r [Stiletto]", "    .collect 10,1"].join("\n"));
	assert.deepEqual(goalsOf(out2), ["buy 10 x1 npc 4"]);
	const out3 = guideText(["step", "    .vendor >> |cRXP_BUY_Buy a|r [Thing] from someone"].join("\n"));
	assert.deepEqual(goalsOf(out3), ["vendor nearest -- Buy a [Thing] from someone"]);
});

test("a profession spell is a profession train; a text-less check is a when skill; a pet spell is no trainer visit", () => {
	const out = guideText(["step", "    .train 2575,3 --Mining Trained", "    .train 2981 >>|cRXP_WARN_Attack mobs with it to learn|r [Claw (Rank 2)]"].join("\n"));
	assert.deepEqual(goalsOf(out), ["when skill Mining 1", 'task "Attack mobs with it to learn [Claw (Rank 2)]"']);
});

test("a kill objective on a friendly NPC reads as talking, not killing", () => {
	const data = { npcs: { 1: { name: "Sentinel Shaya", faction: "A" }, 2: { name: "Dashel", faction: "A" }, 3: { name: "Grell", faction: "H" } } };
	const line = (text, comment) => ({ text, comment });
	const q = (objectiveText) => ({ objectiveText });
	assert.equal(friendlyKillText({ id: 1, count: 1 }, q("Listen to Shaya."), "Alliance", line(null, null), data), "Talk to Sentinel Shaya");
	assert.equal(friendlyKillText({ id: 1, count: 1 }, q("Heal her."), "Alliance", line(null, "Heal and fortify Sentinel Shaya"), data), "Heal and fortify Sentinel Shaya");
	assert.equal(friendlyKillText({ id: 1, count: 1 }, q("Find Shaya."), "Alliance", line(null, "Shaya (1)"), data), "Find Sentinel Shaya");
	assert.equal(friendlyKillText({ id: 2, count: null }, q("Defeat Dashel in Stormwind."), "Alliance", line(null, null), data), undefined);
	assert.equal(friendlyKillText({ id: 3, count: 1 }, q("Speak."), "Alliance", line(null, null), data), undefined);
});

test("a negative quest id on an optional hand-in is read as the quest", () => {
	assert.equal(goalText({ kind: "turnin", quest: 214 }), "turnin 214");
});

test("RXP's objective number is the fallback when no name fits, and is checked against the data", async () => {
	const { resolveObjective } = await import("../src/objective.mjs");
	const three = { objectives: [{ type: "kill", id: 1, text: "Firegut Ogre Mage" }, { type: "kill", id: 2, text: "Firegut Ogre" }, { type: "kill", id: 3, text: "Firegut Brute" }] };
	assert.equal(resolveObjective(three, "", null, { index: 2 }).index, 2);
	assert.equal(resolveObjective(three, "", null, { index: 4 }), null);
	assert.equal(resolveObjective(three, "", null), null);
	// the name wins over the number when it fits
	assert.equal(resolveObjective(three, "Firegut Brute slain (7)", null, { index: 1 }).index, 3);
	// a loose name hit that the number contradicts is no match
	const two = { objectives: [{ type: "kill", id: 1, text: "Fillion Flamebreeze" }, { type: "object", id: 2, text: "Dusty Bedroll" }] };
	assert.equal(resolveObjective(two, "Carry Fillion Flamebreeze to safety while avoiding enemies", null, { index: 2 }), null);
	// two names that fit: the longer one
	const murlocs = { objectives: [{ type: "kill", id: 1, text: "Murloc Streamrunner" }, { type: "kill", id: 2, text: "Murloc" }] };
	assert.equal(resolveObjective(murlocs, "Murloc Streamrunners slain (4)", null, { index: 1 }).index, 1);
	// an item that is not the quest's objective is no hit
	assert.equal(resolveObjective({ objectives: [{ type: "item", id: 5, text: "Ore" }] }, "", 9, { strictItem: true }), null);
});

test("a header's race limit keeps the guide's own side only", () => {
	const all = ["Human", "Dwarf", "Gnome", "NightElf", "Orc", "Troll", "Tauren", "Undead", "Skyborne"];
	assert.deepEqual(headerRaces(all.filter((r) => r !== "NightElf"), "Alliance"), ["Human", "Dwarf", "Gnome", "Skyborne"]);
	assert.deepEqual(headerRaces(["Human", "Dwarf", "Gnome", "NightElf", "Skyborne"], "Alliance"), []);
	assert.deepEqual(headerRaces(["Orc", "Troll"], "Horde"), ["Orc", "Troll"]);
	assert.deepEqual(headerRaces(undefined, "Horde"), []);
});

test("an inn named by zone is one of the guide's own side, the bound one first", () => {
	const data = {
		zones: { 1444: { name: "Feralas" } },
		inns: [
			{ location: "Camp Mojache", names: [], map: 1444, c: 1, x: 75, y: 45 },
			{ location: "Feathermoon Stronghold", names: [], map: 1444, c: 0, x: 31, y: 43 },
			{ location: "Theramore", names: [], map: 1, c: 0, x: 1, y: 1 },
			{ location: "Booty Bay", names: [], map: 2, c: 0, x: 1, y: 1 },
		],
	};
	assert.equal(innNamed(data, "Feralas", null, "Alliance").location, "Feathermoon Stronghold");
	assert.equal(innNamed(data, "Feralas", null, "Horde").location, "Camp Mojache");
	assert.equal(innNamed(data, "Feralas", null, "Horde", "Camp Mojache").location, "Camp Mojache");
	assert.equal(innNamed(data, "Booty Bay", null, "Horde").location, "Booty Bay");
});
