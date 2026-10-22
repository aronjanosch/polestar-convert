// The RXP adapter's helpers that need no Polestar data, and a translated run on invented data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGuide } from "../src/rxp/parse.mjs";
import { skillWhen, spellNames, moneyWhen, cooldownWhen, convertGuide, friendlyKillText, headerRaces } from "../src/rxp/convert.mjs";
import { goalText, Report } from "../src/ir.mjs";
import { innNamed } from "../src/data.mjs";
import { alignFile, pairLanguage } from "../src/rxp/locale.mjs";
import { expandIncludes } from "../src/rxp/chain.mjs";
import { pairRendered } from "../src/i18n/pair.mjs";

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

// A translated guide through the whole RXP run, on invented text and data.
const data = {
	quests: { 1: { title: "A Thing", start: { npc: [201] }, end: { npc: [201] }, level: 2, minLevel: 1, objectives: [] } },
	npcs: { 201: { name: "Bob", spawns: { 1: { pts: [[10, 10]] } }, rank: 0 } },
	items: {}, objects: {}, zones: { 1: { name: "Testville" } },
	frames: { forever: { 1: { left: 100, right: 0, top: 100, bottom: 0 } }, era: {} },
	races: null, inns: [], flights: [], journal: new Map(), hasProfessions: false,
	npcByName: new Map([["bob", [{ id: 201, name: "Bob", spawns: { 1: { pts: [[10, 10]] } }, rank: 0 }]]]),
};
const EN = `#name 1-6 Testville
step
    >>Talk to Bob by the well
    .accept 1 >> Accept A Thing
    .target Bob
step
    >>Walk to the old mill
    .goto 1,10,10
`;
const TR = EN.replace("1-6 Testville", "1-6级 测试镇").replace("Talk to Bob by the well", "在井边与鲍勃对话")
	.replace("Accept A Thing", "接受任务 一件事").replace(".target Bob", ".target 鲍勃").replace("Walk to the old mill", "走到老磨坊");
const render = (g) => convertGuide(g, data, { report: new Report(), slug: "testville", packId: "mine", next: [], before: new Set() }).text;

test("a translated guide pairs through convert", () => {
	const en = parseGuide(EN);
	const [aligned] = alignFile([en], [parseGuide(TR)], new Report());
	const pairs = pairRendered(render(en), render(aligned.guide), new Report());
	assert.equal(pairs.get("Talk to Bob by the well"), "在井边与鲍勃对话");
	assert.equal(pairs.get("Walk to the old mill"), "走到老磨坊");
	assert.equal(aligned.names.get("Bob"), "鲍勃");
	const run = pairLanguage([[en]], [[parseGuide(TR)]], [{ at: 0, slug: "testville", text: render(en) }], render);
	assert.equal(run.pairs.get("Talk to Bob by the well"), "在井边与鲍勃对话");
	assert.equal(run.names.get("Bob"), "鲍勃");
});

test("a missing translation file leaves the guide English", () => {
	const en = parseGuide(EN);
	assert.deepEqual(alignFile([en], [], new Report()), [null]);
	const run = pairLanguage([[en]], [[]], [{ at: 0, slug: "testville", text: render(en) }], () => { throw new Error("not rendered"); });
	assert.equal(run.pairs.size, 0);
	assert.equal(run.guides.get("testville").counts.get("locale: guide not paired"), 1);
});

test("an included guide's steps come from the translated file too", () => {
	const inc = `#group G\n#name Part\nstep\n    >>Walk to the old mill\n    .goto 1,10,10\n`;
	const main = `#group G\n#name Whole\nstep\n    #include G\\Part\n`;
	const tr = inc.replace("Walk to the old mill", "走到老磨坊").replace("#name Part", "#name 部分");
	const en = [parseGuide(inc), parseGuide(main)];
	const expanded = expandIncludes(en, new Report());
	const run = pairLanguage([en], [[parseGuide(tr), parseGuide(main)]], [{ at: 1, slug: "whole", text: render(expanded[1]) }], render);
	assert.equal(run.pairs.get("Walk to the old mill"), "走到老磨坊");
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

test(".trainer with one target per class: each class trains at its own trainer", () => {
	const out = guideText(["step << Warlock/Paladin", "    .trainer >> Train your class spells", "    .target Bixi << Warlock", "    .target Buliwyf << Paladin"].join("\n"));
	assert.deepEqual(goalsOf(out), ["train 1 only Warlock -- Train your class spells", "train 2 only Paladin -- Train your class spells"]);
});

test("a group step about several quests holds on its turn-ins; only the group work is optional", () => {
	const out = String(guideText(["step", "    .group", "    .turnin 11 >> Turn in A", "    .accept 12 >> Accept B", "    .complete 12,1"].join("\n")).text || "");
	const goals = out.split("\n").map((l) => l.trim()).filter((l) => /^(turnin|accept|complete)\b/.test(l));
	assert.deepEqual(goals.map((l) => /\boptional\b/.test(l)), [false, false, true]);
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

const stepsOf = (body) => String(guideText(body).text || "");

test("#completewith a label no step defines is a bare along; a label only earlier is an ordinary step", () => {
	const none = stepsOf(["step", "    #completewith Nowhere", "    .collect 10,3 >> Collect things", "step", "    .goto 1,10,10"].join("\n"));
	assert.match(none, /^  along$/m);
	assert.doesNotMatch(none, /along until/);
	const earlier = stepsOf(["step", "    #label Back", "    .goto 1,10,10", "step", "    #completewith Back", "    .collect 10,3 >> Collect things"].join("\n"));
	assert.doesNotMatch(earlier, /^  along/m);
});

test("a label survives its dropped step: a #completewith step finds its target", () => {
	const out = stepsOf(["step", "    #completewith Spot", "    .collect 10,3 >> Collect things", "step", "    #label Spot", "    #completewith Fin", "    .goto 1,10,10", "step", "    .accept 1 >> Accept A", "step", "    #label Fin", "    .accept 2 >> Accept B"].join("\n"));
	assert.match(out, /along until \S+/);
	const m = out.match(/along until (\S+)/)[1];
	assert.match(out, new RegExp(`label ${m}\\b`));
});

test("a use without quest beside countable goals of a #completewith step stays along", () => {
	const out = stepsOf(["step", "    #completewith next", "    .use 10 >> Use the thing", "    .collect 10,3 >> Collect things", "step", "    .accept 1 >> Accept A"].join("\n"));
	assert.match(out, /^  along/m);
	assert.match(out, /^  use /m);
});

test("a per-quest split keeps the along and the label sits on the last part", () => {
	const out = stepsOf(["step", "    #completewith Done", "    #label Mid", "    .complete 901,1 >> Do A", "    .complete 902,1 >> Do B", "step", "    #label Done", "    .accept 1 >> Accept A", "step", "    .accept 2 >> Accept B"].join("\n"));
	const parts = out.split(/^step/m).slice(1);
	const onq = parts.filter((p) => /when onquest/.test(p));
	assert.ok(onq.length >= 2, out);
	assert.ok(onq.every((p) => /along until/.test(p)), out);
});

// Carried gotos: a small map with a vendor, to see which points of a `#completewith` step reach the next one.
const mapText = (body, extra = {}) => String(convertGuide(parseGuide("#name T\n" + body), { ...fakeData(), zones: { 1: { name: "Testville" } }, frames: { forever: {}, era: { 1: { left: 100, right: 0, top: 100, bottom: 0 } } }, ...extra }, { report: new Report(), slug: "t", packId: "chk" }).text);
const gotosOf = (text) => text.split("\n").map((l) => l.trim()).filter((l) => /^goto\b/.test(l));
const WALK = ["step", "    >>Walk to the mill", "    .goto 1,70,70"];

test("a goto naming its map by number is a point on that map", () => {
	assert.deepEqual(gotosOf(mapText(WALK.join("\n"))), ['goto 70,70 "Walk to the mill" era']);
});

test("a #completewith step with a goal of its own carries no points on", () => {
	const text = mapText(["step", "    #completewith next", "    .goto 1,20,20", "    .goto 1,30,30", "    >>Buy water", "    .vendor 4", ...WALK].join("\n"));
	assert.equal(gotosOf(text).some((l) => /^goto (20|30),/.test(l)), false);
});

test("a #completewith walk carries its points into the next step", () => {
	const text = mapText(["step", "    #completewith next", "    .goto 1,20,20", "    >>Go east", ...WALK].join("\n"));
	assert.equal(gotosOf(text).some((l) => /^goto 20,20/.test(l)), true);
});

test("a deathskip, hearth or teleport step carries no points and ends a way that waited", () => {
	for (const line of ["    .deathskip >>Die and respawn", "    .hs >>Hearth to Testville", "    .cast 18960 >>Cast [Teleport: Moonglade]"]) {
		const text = mapText(["step", "    #completewith next", "    .goto 1,20,20", "    >>Go east", "step", "    #completewith next", "    .goto 1,30,30", line, ...WALK].join("\n"));
		assert.deepEqual(gotosOf(text).filter((l) => /^goto (20|30),/.test(l)), [], line);
	}
});

test("a #completewith step that is no walk ends the way waiting before it", () => {
	const text = mapText(["step", "    #completewith next", "    .goto 1,20,20", "    >>Go east", "step", "    #completewith next", "    .goto 1,40,40", "    .mob Boar", "    >>Kill boars", ...WALK].join("\n"));
	assert.deepEqual(gotosOf(text).filter((l) => /^goto (20|40),/.test(l)), []);
});

test("a point for other classes is not the way into a step of another class", () => {
	const text = mapText(["step", "    #completewith next", "    .goto 1,20,20 << Warrior", "    >>Go east", "step << Mage", "    >>Walk to the mill", "    .goto 1,70,70"].join("\n"));
	assert.equal(gotosOf(text).some((l) => /^goto 20,20/.test(l)), false);
});

test("a goal's place is not the guide's last place on a dungeon detour", () => {
	const body = ["step", "    >>Walk to the cave", "    .goto 1,70,70", "step", "    .dungeon WC", "    .complete 99,1 >>Kill Boss"].join("\n");
	assert.equal(/complete 99[^\n]*@70,70/.test(mapText(body)), false);
});
