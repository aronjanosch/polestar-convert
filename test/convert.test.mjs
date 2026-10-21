// The RXP adapter's helpers that need no Polestar data, and a translated run on invented data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGuide } from "../src/rxp/parse.mjs";
import { skillWhen, spellNames, moneyWhen, cooldownWhen, convertGuide } from "../src/rxp/convert.mjs";
import { goalText, Report } from "../src/ir.mjs";
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
