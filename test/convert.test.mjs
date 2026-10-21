// The RXP adapter's helpers that need no Polestar data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGuide } from "../src/rxp/parse.mjs";
import { skillWhen, spellNames, moneyWhen, cooldownWhen, friendlyKillText } from "../src/rxp/convert.mjs";
import { goalText } from "../src/ir.mjs";

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
