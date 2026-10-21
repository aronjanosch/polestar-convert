// The renderer takes the intermediate form only: no RXP, no Polestar data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "../src/emit.mjs";
import { Report, cut, goalText, questOf } from "../src/ir.mjs";

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

test("a step that completes with a later label runs along through it, goals stay required", () => {
	const r = run([
		step({ title: "Kill", completesWith: "camp", allAlong: true, goals: [{ kind: "kill", npc: 3, quest: 9, oi: 1, only: "" }] }),
		step({ label: "camp", goals: [{ kind: "turnin", quest: 9, only: "" }] }),
		step({ goals: [{ kind: "accept", quest: 10, only: "" }] }),
	]);
	assert.match(r.text, /^  along until camp-end$/m);
	assert.match(r.text, /^  label camp-end$/m);
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

test("goal text of the Zygor forms: talk, kill/interact without a quest, learn, rep, money", () => {
	assert.equal(goalText({ kind: "talk", npc: 1568 }), "talk 1568");
	assert.equal(goalText({ kind: "kill", npc: 1512 }), "kill 1512");
	assert.equal(goalText({ kind: "interact", object: 176793 }), "interact 176793");
	assert.equal(goalText({ kind: "learn", spell: 3275, name: "First Aid" }), 'learn 3275 "First Aid"');
	assert.equal(goalText({ kind: "learn", spell: 3275 }), "learn 3275");
	assert.equal(goalText({ kind: "rep", faction: "Timbermaw Hold", standing: "Friendly" }), 'rep "Timbermaw Hold" Friendly');
	assert.equal(goalText({ kind: "money", copper: 10000 }), "money 10000");
	assert.equal(goalText({ kind: "kill", npc: 3, quest: 9, oi: 1 }), "kill 3 quest 9.1");
	assert.equal(goalText({ kind: "interact", object: 4, quest: 9, oi: 2 }), "interact 4 quest 9.2");
});

test("alongUntil waits for the label as it is, not for the step after it", () => {
	const r = run([
		step({ title: "Kill", alongUntil: "b", allAlong: true, goals: [{ kind: "kill", npc: 3, only: "" }] }),
		step({ goals: [{ kind: "accept", quest: 10, only: "" }] }),
		step({ label: "b", goals: [{ kind: "turnin", quest: 10, only: "" }] }),
	]);
	assert.match(r.text, /^  along until b$/m);
	assert.match(r.text, /^  label b$/m);
	assert.doesNotMatch(r.text, /-end/);
});

test("skipto is written before the goals and its label is written", () => {
	const r = run([
		step({ goals: [{ kind: "accept", quest: 100, only: "" }], skipto: [{ label: "c", when: "turnedin 100" }] }),
		step({ goals: [{ kind: "accept", quest: 11, only: "" }] }),
		step({ label: "c", goals: [{ kind: "accept", quest: 12, only: "" }] }),
	]);
	assert.match(r.text, /^  skipto c when turnedin 100\n  accept 100$/m);
	assert.match(r.text, /^  label c$/m);
});

test("cut keeps a short text", () => assert.equal(cut("Kill the boar", 40), "Kill the boar"));
test("cut ends at the last space within n, with an ellipsis", () =>
	assert.equal(cut("Kill the messenger. Loot him for his Mysterious Message", 40), "Kill the messenger. Loot him for his…"));
test("cut without a space cuts at n", () => assert.equal(cut("击杀迪菲亚信使并拾取他身上的神秘信件然后交给哨兵岭的守卫", 10), "击杀迪菲亚信使并拾取…"));
