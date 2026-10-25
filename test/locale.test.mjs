import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGuide } from "../src/rxp/parse.mjs";
import { alignGuide, alignFile, lineMemory } from "../src/rxp/locale.mjs";
import { Report } from "../src/ir.mjs";

// Invented guides in RXP's syntax; no real guide text lives in this repo.
const EN = `#name 1-6 Testville
#displayname 1-6 Testville
step
    >>Talk to |cRXP_FRIENDLY_Bob|r
    +Be careful
    .accept 1 >> Accept A Thing
    .target Bob
step
    >>Go home
    .goto 1,10,10
`;
const TR = `#name 1-6级 测试镇
#displayname 1-6级 测试镇
step
    >>与 |cRXP_FRIENDLY_鲍勃|r 对话
    +小心
    .accept 1 >> 接受任务 一件事
    .target 鲍勃
step
    >>回家
    .goto 1,10,10
`;

test("pairs texts, notes and command texts", () => {
	const en = parseGuide(EN);
	const { guide } = alignGuide(en, parseGuide(TR), new Report());
	const [t, n, a] = guide.steps[0].lines;
	assert.equal(t.text, "与 |cRXP_FRIENDLY_鲍勃|r 对话");
	assert.equal(n.text, "小心");
	assert.equal(a.text, "接受任务 一件事");
	assert.equal(a.args, "1");
	assert.equal(a.cond, en.steps[0].lines[2].cond);
	assert.equal(a.comment, en.steps[0].lines[2].comment);
	assert.equal(guide.header.name, "1-6级 测试镇");
	assert.ok(guide.header.flags.includes("displayname 1-6级 测试镇"));
	assert.equal(en.steps[0].lines[0].text, "Talk to |cRXP_FRIENDLY_Bob|r", "the English is not changed");
});

test("name commands pair by position", () => {
	const { guide, names } = alignGuide(parseGuide(EN), parseGuide(TR), new Report());
	assert.equal(names.get("Bob"), "鲍勃");
	assert.equal(guide.steps[0].lines[3].args, "Bob");
});

test("a step with an extra line keeps its English", () => {
	const report = new Report();
	const tr = TR.replace("    >>与", "    >>多一行\n    >>与");
	const { guide } = alignGuide(parseGuide(EN), parseGuide(tr), report);
	assert.equal(guide.steps[0].lines[0].text, "Talk to |cRXP_FRIENDLY_Bob|r");
	assert.equal(guide.steps[1].lines[0].text, "回家");
	assert.equal(report.counts.get("locale: step not paired"), 1);
});

test("a cmd with other args does not pair", () => {
	const tr = TR.replace(".accept 1 >>", ".accept 2 >>");
	const { guide } = alignGuide(parseGuide(EN), parseGuide(tr), new Report());
	assert.equal(guide.steps[0].lines[2].text, "Accept A Thing");
});

// Five steps, each its own goto, so each step has its own signature.
const many = (words) => `#name 1-6 Testville\n${words.map((w, i) => `step\n    >>${w}\n    .goto 1,${i + 1},${i + 1}\n`).join("")}`;
const EN5 = many(["One", "Two", "Three", "Four", "Five"]);
const TR5 = ["一", "二", "三", "四", "五"];
const texts = (g) => g.steps.map((s) => s.lines[0].text);

test("one extra translated step", () => {
	const report = new Report();
	const tr = parseGuide(many(TR5)), extra = parseGuide(many(["多"])).steps[0];
	extra.lines[1].args = "1,99,99";
	tr.steps.splice(2, 0, extra);
	const [a] = alignFile([parseGuide(EN5)], [tr], report);
	assert.deepEqual(texts(a.guide), TR5);
	assert.equal(report.counts.get("locale: step not paired"), undefined);
});

test("one English step missing in tr", () => {
	const report = new Report();
	const tr = parseGuide(many(TR5));
	tr.steps.splice(3, 1);
	const [a] = alignFile([parseGuide(EN5)], [tr], report);
	assert.deepEqual(texts(a.guide), ["一", "二", "三", "Four", "五"]);
	assert.equal(report.counts.get("locale: step not paired"), 1);
});

test("mostly different guides are not paired", () => {
	const report = new Report();
	const tr = parseGuide(many(TR5));
	tr.steps.forEach((s, i) => { if (i < 3) s.lines[1].args = `2,${i},${i}`; });
	assert.deepEqual(alignFile([parseGuide(EN5)], [tr], report), [null]);
	assert.equal(report.counts.get("locale: guide not paired"), 1);
});

test("a missing translation: no guide", () => {
	const report = new Report();
	assert.deepEqual(alignFile([parseGuide(EN)], [], report), [null]);
	assert.equal(report.counts.get("locale: guide not paired"), 1);
});

// The memory: line texts RXP translated in another guide.
test("the memory holds each English line text with its translation", () => {
	const memory = lineMemory([parseGuide(EN)], [parseGuide(TR)]);
	assert.equal(memory.get("Talk to |cRXP_FRIENDLY_Bob|r"), "与 |cRXP_FRIENDLY_鲍勃|r 对话");
	assert.equal(memory.get("Go home"), "回家");
	assert.equal(memory.has("Be careful"), true);
});

test("the memory leaves out texts that are not translated", () => {
	const tr = TR.replace(">>回家", ">>Go home").replace("+小心", "+Be careful (NOT TRANSLATED IN :zhCN YET)");
	const memory = lineMemory([parseGuide(EN)], [parseGuide(tr)]);
	assert.equal(memory.has("Go home"), false);
	assert.equal(memory.has("Be careful"), false);
});

test("a guide without its translation takes its lines from the memory", () => {
	const report = new Report();
	const memory = new Map([["Go home", "回家"]]);
	const [a] = alignFile([parseGuide(EN)], [], report, memory);
	assert.equal(a.guide.steps[1].lines[0].text, "回家");
	assert.equal(a.guide.steps[0].lines[0].text, "Talk to |cRXP_FRIENDLY_Bob|r");
	assert.equal(a.guide.header.name, "1-6 Testville");
	assert.equal(report.counts.get("locale: guide not paired"), 1);
	assert.equal(report.counts.get("locale: step not paired"), undefined);
});

test("a line its translation left English or marked takes the memory's", () => {
	const report = new Report();
	const tr = TR.replace(">>回家", ">>Go home").replace("+小心", "+Be careful (NOT TRANSLATED IN :zhCN YET)");
	const memory = new Map([["Go home", "回家去"], ["Be careful", "当心"]]);
	const { guide } = alignGuide(parseGuide(EN), parseGuide(tr), report, undefined, memory);
	assert.equal(guide.steps[1].lines[0].text, "回家去");
	assert.equal(guide.steps[0].lines[1].text, "当心");
	assert.equal(report.counts.get("locale: not translated in source"), 1);
});
