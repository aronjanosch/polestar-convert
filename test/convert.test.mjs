// The RXP adapter's helpers that need no Polestar data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGuide } from "../src/rxp/parse.mjs";
import { skillWhen, spellNames, moneyWhen, cooldownWhen, convertGuide } from "../src/rxp/convert.mjs";
import { goalText, Report } from "../src/ir.mjs";

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
