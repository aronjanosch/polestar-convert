// The renderer takes the intermediate form only: no RXP, no Polestar data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "../src/emit.mjs";
import { Report, goalText, questOf } from "../src/ir.mjs";

const step = (o) => ({ stepNo: 1, only: {}, whens: [], goals: [], tips: [], notes: [], maps: [], loop: [], allAlong: false, format: 4, ...o });
const guide = (steps) => ({ name: "Invented", title: "Invented Vale", faction: "Horde", classes: null, races: ["Undead"], levels: "1-4", zone: "Invented Vale", defaultMap: 1, sourceSteps: steps.length, steps });
const run = (steps) => render(guide(steps), { report: new Report(), slug: "vale", packId: "mine", next: ["vale-2"] });

test("header, goals with only/optional/comment, zone change and pack format", () => {
	const r = run([
		step({ title: "Start", goals: [
			{ kind: "accept", quest: 10, only: "" },
			{ kind: "train", class: true, comment: "Learn your spell", only: "Mage,Priest" },
			{ kind: "buy", item: 5, itemName: "Fine \"Bread\"", count: 2, only: "" },
		] }),
		step({ maps: [2], goals: [{ kind: "task", text: "Skip the cutscene", only: "" }], format: 5 }),
	]);
	assert.equal(r.format, 5);
	assert.equal(r.stepsIn, 2);
	assert.deepEqual(r.text.split("\n").slice(0, 10), [
		"guide mine/vale", "title Invented Vale", "faction Horde", "race Undead", "levels 1-4", "zone Invented Vale", "coords live", "next mine/vale-2", "category Leveling", "",
	]);
	assert.match(r.text, /^  accept 10$/m);
	assert.match(r.text, /^  train class only Mage,Priest -- Learn your spell$/m);
	assert.match(r.text, /^  buy 5 "Fine \\"Bread\\"" x2 nearest$/m);
	assert.match(r.text, /^  zone map 2$/m);
	assert.match(r.text, /^  task "Skip the cutscene"$/m);
});

test("a step that completes with a later label becomes along, the label is written, goals stay required", () => {
	const r = run([
		step({ title: "Kill", completesWith: "camp", allAlong: true, goals: [{ kind: "kill", npc: 3, quest: 9, oi: 1, only: "" }] }),
		step({ label: "camp", goals: [{ kind: "turnin", quest: 9, only: "" }] }),
	]);
	assert.match(r.text, /^  along until camp$/m);
	assert.match(r.text, /^  label camp$/m);
	assert.doesNotMatch(r.text, /optional/);
});

test("goal text and quest dependency", () => {
	assert.equal(goalText({ kind: "accept", quest: 7, title: "Odd Job", at: { x: 1.5, y: 2, live: false } }), 'accept 7 "Odd Job" @1.5,2 era');
	assert.equal(goalText({ kind: "collect", item: 4, quest: 7, oi: 2 }), "collect 4 quest 7.2");
	assert.equal(goalText({ kind: "level", level: 5, xp: 300 }), "level 5+300");
	assert.equal(goalText({ kind: "train", profession: "First Aid", npc: 8 }), 'train "First Aid" npc 8');
	assert.equal(questOf({ kind: "turnin", quest: 7 }), 7);
	assert.equal(questOf({ kind: "accept", quest: 7 }), null);
	assert.throws(() => goalText({ kind: "dance" }));
});
