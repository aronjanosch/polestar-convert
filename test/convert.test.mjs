// The RXP adapter's helpers that need no Polestar data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGuide } from "../src/rxp/parse.mjs";
import { skillWhen, spellNames, moneyWhen, cooldownWhen, headerRaces } from "../src/rxp/convert.mjs";
import { goalText } from "../src/ir.mjs";
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
