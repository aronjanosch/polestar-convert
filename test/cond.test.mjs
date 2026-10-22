import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCondition, andOnly, onlyText, condsMeet, onlyMeet } from "../src/cond.mjs";

test("a class list is an OR", () => {
	assert.deepEqual(parseCondition("Warrior/Priest").only, { class: ["Warrior", "Priest"] });
});

test("negations become the positive list of the other classes", () => {
	const { only } = parseCondition("!Warlock !Mage");
	assert.equal(only.class.includes("Warlock"), false);
	assert.equal(only.class.includes("Mage"), false);
	assert.equal(only.class.length, 7);
});

test("class and race are two groups that AND", () => {
	assert.equal(onlyText(parseCondition("Undead Mage").only), "Mage,Undead");
});

test("an impossible condition is reported", () => {
	assert.equal(parseCondition("Mage !Mage").never, true);
});

test("step and line conditions intersect", () => {
	const a = parseCondition("Warrior/Priest/Mage").only;
	const b = parseCondition("Priest/Rogue").only;
	assert.deepEqual(andOnly(a, b).class, ["Priest"]);
});

test("`skip` and other versions' words are false in RXP: nobody passes", () => {
	const c = parseCondition("skip");
	assert.equal(c.never, true);
	assert.deepEqual(c.unknown, []);
	assert.equal(parseCondition("Hunter skip").never, true);
	assert.equal(parseCondition("sod").never, true);
});

test("a negated version word is true: `!sod/Warrior` is everybody", () => {
	assert.deepEqual(parseCondition("!sod/Warrior").only, {});
	assert.deepEqual(parseCondition("!skip Hunter").only, { class: ["Hunter"] });
});

test("a typo is false and listed", () => {
	const c = parseCondition("Maget");
	assert.deepEqual(c.unknown, ["Maget"]);
	assert.equal(c.never, true);
});

test("`/` binds weaker than a space: Dwarf Priest/Gnome Priest", () => {
	const c = parseCondition("Dwarf Priest/Gnome Priest");
	assert.deepEqual(c.only, { class: ["Priest"], race: ["Dwarf", "Gnome"] });
	assert.equal(c.inexact, false);
	assert.deepEqual(parseCondition("Orc Rogue/Troll Rogue").only, { class: ["Rogue"], race: ["Orc", "Troll"] });
});

test("a race implies its faction; Skyborne is on both", () => {
	assert.deepEqual(parseCondition("Orc").only, { race: ["Orc"] });
	assert.deepEqual(parseCondition("Alliance").only, { faction: ["Alliance"] });
	assert.deepEqual(parseCondition("Skyborne").only, { race: ["Skyborne"] });
	assert.equal(parseCondition("Orc Alliance").never, true);
	assert.equal(condsMeet("Skyborne Horde", "Alliance"), false);
	assert.equal(condsMeet("Skyborne", "Alliance"), true);
});

test("a condition that is no product splits into disjoint products", () => {
	const c = parseCondition("Alliance/!Shaman");
	assert.equal(c.inexact, true);
	assert.deepEqual(c.groups.map(onlyText).sort(), ["Alliance", "Warrior,Paladin,Hunter,Rogue,Priest,Mage,Warlock,Druid,Horde"].sort());
	const t = parseCondition("!Rogue/Dwarf Rogue");
	assert.equal(t.groups.length, 2);
});

test("inside the guide's scope a condition can be exact", () => {
	// Skyborne guide: both factions, one race.
	assert.deepEqual(parseCondition("Skyborne Warrior", { race: ["Skyborne"] }).only, { class: ["Warrior"] });
	// Alliance only: `Alliance/!Shaman` is Alliance or Horde non-Shaman = nobody Horde there.
	const c = parseCondition("Alliance/!Shaman", { faction: ["Alliance"] });
	assert.equal(c.inexact, false);
	assert.deepEqual(c.only, {});
});

test("conditions meet through onlyMeet", () => {
	assert.equal(onlyMeet({ race: ["Orc"] }, { faction: ["Alliance"] }), false);
	assert.equal(onlyMeet({ class: ["Rogue"] }, { race: ["Orc"] }), true);
});

test("two conditions meet when some player passes both", () => {
	assert.equal(condsMeet("Shaman", "Warrior"), false);
	assert.equal(condsMeet("Shaman", "Warrior/Shaman"), true);
	assert.equal(condsMeet("Shaman", null), true);
	assert.equal(condsMeet(null, null), true);
	assert.equal(condsMeet("Orc Shaman", "!Shaman"), false);
	assert.equal(condsMeet("Orc", "Shaman"), true);
});
