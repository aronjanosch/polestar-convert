import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGuide } from "../src/rxp/parse.mjs";
import { alignGuide, alignFile } from "../src/rxp/locale.mjs";
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

test("different step counts: no guide", () => {
	const report = new Report();
	const tr = parseGuide(TR);
	tr.steps.pop();
	assert.deepEqual(alignFile([parseGuide(EN)], [tr], report), [null]);
	assert.equal(report.counts.get("locale: guide not paired"), 1);
	assert.deepEqual(alignFile([parseGuide(EN)], [], new Report()), [null]);
});
