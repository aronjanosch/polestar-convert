import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCondition, andOnly, onlyText, condsMeet } from "../src/cond.mjs";

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

test("unknown words are listed, not guessed", () => {
	assert.deepEqual(parseCondition("skip").unknown, ["skip"]);
});

test("two conditions meet when some player passes both", () => {
	assert.equal(condsMeet("Shaman", "Warrior"), false);
	assert.equal(condsMeet("Shaman", "Warrior/Shaman"), true);
	assert.equal(condsMeet("Shaman", null), true);
	assert.equal(condsMeet(null, null), true);
	assert.equal(condsMeet("Orc Shaman", "!Shaman"), false);
	assert.equal(condsMeet("Orc", "Shaman"), true);
});
