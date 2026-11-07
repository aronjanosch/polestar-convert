import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGuide } from "../src/rxp/parse.mjs";
import { convertGuide } from "../src/rxp/convert.mjs";
import { Report } from "../src/ir.mjs";

const data = {
	quests: { 1: { id: 1, title: "Fill the vessel", start: { npc: [20] }, end: { npc: [20] }, objectives: [{ type: "item", id: 11, count: 1, text: "Filled vessel" }] } },
	npcs: { 20: { id: 20, name: "Keeper", spawns: { 1: { pts: [[10, 10]] } } } },
	items: { 10: { id: 10, name: "Empty vessel" }, 11: { id: 11, name: "Filled vessel" } },
	objects: {}, zones: { 1: { name: "Test vale" } },
	frames: { forever: {}, era: { 1: { left: 100, right: 0, top: 100, bottom: 0 } } },
	races: {}, inns: [], flights: [], journal: new Map(), npcByName: new Map(), hasProfessions: false,
};
const convert = (body) => convertGuide(parseGuide("#name 1-3 Test vale\n" + body), data,
	{ report: new Report(), slug: "sequence", packId: "test", next: [] }).text;
const objectives = (text) => text.split("\n").map((line) => line.trim())
	.filter((line) => /^(accept|turnin|collect|use|when|only|along|label|skipto)\b/.test(line));

for (const extra of [".money <0.01", ".itemcount 11,<6", ".mob Boar", ""]) {
	test(`inline travel instructions do not create manual work beside the route: ${extra}`, () => {
		const body = `step
    #completewith next
    .goto 1,20,20,12 >>Travel toward the keeper
    ${extra}
step
    .accept 1
`;
		const actual = convert(body);
		assert.match(actual, /Travel toward the keeper/);
		assert.doesNotMatch(actual, /^\s+task /m);
		assert.deepEqual(objectives(actual), objectives(convert(body.replace(/ >>[^\n]*/g, ""))));
	});
}

test("inline text does not become an extra task beside existing farming instructions", () => {
	const actual = convert(`step
    #completewith next
    .goto 1,20,20,12 >>Enter the cave
    .itemcount 11,<6
    >>Gather supplies
step
    .accept 1
`);
	assert.match(actual, /task "Gather supplies"/);
	assert.match(actual, /Enter the cave/);
	assert.doesNotMatch(actual, /task "Enter the cave"/);
});

test("consecutive inline travel instructions retain their source order", () => {
	const actual = convert(`step
    #completewith next
    .goto 1,20,20 >>First cross the bridge
step
    #completewith next
    .goto 1,30,30 >>Then enter the tunnel
step
    .accept 1
`);
	assert.ok(actual.indexOf('note "First cross') < actual.indexOf('note "Then enter'), actual);
});

test("standalone explanations beside existing conditional notes gain no extra manual gate", () => {
	const actual = convert(`step
    #completewith next
    .goto 1,20,20
    >>Existing work << Hunter
    >>Extra explanation
    .mob Boar
step
    .accept 1
`);
	assert.match(actual, /task "Existing work"/);
	assert.match(actual, /Extra explanation/);
	assert.doesNotMatch(actual, /task "Extra explanation"/);
});

for (const condition of ["", " << Mage", " << Warrior/Hunter"]) {
	test(`inline instructions preserve a complete quest sequence${condition}`, () => {
		const body = `step${condition}
    .accept 1
step${condition}
    #completewith next
    .goto 1,20,20,5 >>Walk to the well
step${condition}
    .goto 1,20,20
    .use 10 >>Fill the vessel at the well
    .complete 1,1 -- Filled vessel
step${condition}
    .turnin 1
`;
		const actual = convert(body);
		const baseline = convert(body.replace(/ >>[^\n]*/g, ""));
		assert.deepEqual(objectives(actual), objectives(baseline));
		assert.match(actual, /Walk to the well/);
		assert.match(actual, /Fill the vessel at the well/);
		assert.match(actual, /use 10[^\n]*optional/);
		assert.match(actual, /collect 11[^\n]*quest 1\.1/);
		assert.doesNotMatch(actual, /^\s+task /m);
		assert.ok(actual.indexOf("accept 1") < actual.indexOf("collect 11"));
		assert.ok(actual.indexOf("collect 11") < actual.indexOf("turnin 1"));
	});
}

test("instructions leave an along objective's lifetime and turn-in gate intact", () => {
	const body = `step
    .accept 1
step
    #completewith Return
    .use 10 >>Fill the vessel while travelling
    .complete 1,1 -- Filled vessel
step
    .goto 1,30,30
step
    #label Return
    .turnin 1
step
    .goto 1,40,40
`;
	const actual = convert(body);
	assert.deepEqual(objectives(actual), objectives(convert(body.replace(/ >>[^\n]*/g, ""))));
	assert.match(actual, /along until/);
	assert.match(actual, /Fill the vessel while travelling/);
	assert.doesNotMatch(actual, /^\s+task /m);
});
