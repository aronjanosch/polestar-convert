import { test } from "node:test";
import assert from "node:assert/strict";
import { pairRendered } from "../src/i18n/pair.mjs";
import { Report } from "../src/ir.mjs";

test("pairs title, step, tip, note and quoted texts", () => {
	const en = 'title Testville\n\nstep Kill the boar\n  tip Watch out\n  note Be careful\n  task "Ring the bell" @1,2\n  accept 1 "A Thing"';
	const tr = 'title 测试镇\n\nstep 杀野猪\n  tip 小心\n  note 当心\n  task "敲钟" @1,2\n  accept 1 "某物"';
	const p = pairRendered(en, tr, new Report());
	assert.deepEqual([...p], [["Testville", "测试镇"], ["Kill the boar", "杀野猪"], ["Watch out", "小心"], ["Be careful", "当心"], ["Ring the bell", "敲钟"], ["A Thing", "某物"]]);
});

test("pairs the tail after --", () => {
	const p = pairRendered("step\n  train 5 -- Learn Battle Shout", "step\n  train 5 -- 学习战斗怒吼", new Report());
	assert.equal(p.get("Learn Battle Shout"), "学习战斗怒吼");
});

test("texts come back unescaped", () => {
	const p = pairRendered('step\n  task "Say \\"hi\\" \\\\ x"', 'step\n  task "说 \\"嗨\\""', new Report());
	assert.equal(p.get('Say "hi" \\ x'), '说 "嗨"');
});

test("a line of another shape adds nothing", () => {
	const r = new Report();
	const p = pairRendered('step Go\n  fly "Sentinel Hill"\n  tip Hi', 'step 去\n  task "飞往哨兵岭"\n  tip 嗨', r);
	assert.equal(p.has("Sentinel Hill"), false);
	assert.equal(r.counts.get("locale: line shape differs"), 1);
	assert.equal(p.get("Hi"), "嗨");
	assert.equal(p.get("Go"), "去");
});

test("different block counts pair nothing", () => {
	const r = new Report();
	const p = pairRendered("step A\n\nstep B", "step 甲", r);
	assert.equal(p.size, 0);
	assert.equal(r.counts.get("locale: blocks differ"), 1);
});

test("different line counts in a block are counted", () => {
	const r = new Report();
	const p = pairRendered("step A\n  tip B", "step 甲", r);
	assert.equal(p.size, 0);
	assert.equal(r.counts.get("locale: block lines differ"), 1);
});

test("equal texts are no pair", () => {
	assert.equal(pairRendered("step 1-6", "step 1-6", new Report()).size, 0);
});

test("first translation wins", () => {
	const r = new Report();
	const p = pairRendered("step\n  tip Watch out\n\nstep\n  tip Watch out", "step\n  tip 小心\n\nstep\n  tip 注意", r);
	assert.equal(p.get("Watch out"), "小心");
	assert.equal(r.counts.get("locale: text with two translations"), 1);
});

test("a quote in the tail after -- pairs the whole tail", () => {
	const p = pairRendered('step\n  train 5 -- Learn "Battle Shout"', 'step\n  train 5 -- 学习"战斗怒吼"', new Report());
	assert.deepEqual([...p], [['Learn "Battle Shout"', '学习"战斗怒吼"']]);
});

test("a step's tips pair joined", () => {
	const p = pairRendered("step Go\n  tip A\n  tip B", "step 去\n  tip 甲\n  tip 乙", new Report());
	assert.equal(p.get("A\nB"), "甲\n乙");
	assert.equal(p.get("A"), "甲");
	assert.equal(p.get("B"), "乙");
});

test("joined tips need every tip paired", () => {
	const r = new Report();
	const p = pairRendered('step Go\n  tip A\n  tip B', 'step 去\n  tip 甲\n  task "乙"', r);
	assert.equal(p.has("A\nB"), false);
	assert.equal(p.get("A"), "甲");
	assert.equal(r.counts.get("locale: line shape differs"), 1);
});

test("joined tips need every tip a real pair", () => {
	const p = pairRendered("step Go\n  tip A\n  tip B\n\nstep Run\n  tip C\n  tip D", "step 去\n  tip 甲\n  tip B\n\nstep 跑\n  tip 丙\n  tip D", new Report());
	assert.equal(p.get("A"), "甲");
	assert.equal(p.has("B"), false);
	assert.equal(p.has("A\nB"), false);
	assert.equal(p.get("C"), "丙");
	assert.equal(p.has("C\nD"), false);
});
