import { test } from "node:test";
import assert from "node:assert/strict";
import { fillText } from "../src/i18n/fill.mjs";

const HEAD = `-- Chinese (zhCN): the guide x (y).
-- Written by \`node tools/polestar.js i18n guides sync zhCN\`, which keeps every translation.
return {
`;
const file = (body) => `${HEAD}${body}}\n`;
const KILL = `\t-- Step 3: Kill the {npc:1}
\t-- {npc:1} Bob · {area:10} Testville
\t["Kill {npc:1} south of {area:10}"] = "",
`;
const pairs = new Map([["Kill Bob south of Testville", "在测试镇南边击杀鲍勃"]]);
const names = (map) => (tok) => map[tok] ?? [];
const NAMES = { "npc:1": ["鲍勃"], "area:10": ["测试镇"] };

test("fills a line with tokens", () => {
	const { text, counts } = fillText(file(KILL), pairs, names(NAMES));
	assert.match(text, /\["Kill \{npc:1\} south of \{area:10\}"\] = "在\{area:10\}南边击杀\{npc:1\}",/);
	assert.equal(counts.translated, 1);
	assert.ok(text.startsWith(HEAD));
});

test("a name not found leaves it empty", () => {
	const { text, counts } = fillText(file(KILL), pairs, names({ ...NAMES, "area:10": [] }));
	assert.match(text, /\] = "",/);
	assert.equal(counts["name not found"], 1);
});

test("a kept translation is not touched", () => {
	const src = file(KILL.replace('= ""', '= "我的"'));
	const { text, counts } = fillText(src, pairs, names(NAMES));
	assert.equal(text, src);
	assert.equal(counts.kept, 1);
});

test("a line without a pair is counted", () => {
	const { text, counts } = fillText(file(KILL), new Map(), names(NAMES));
	assert.equal(text, file(KILL));
	assert.equal(counts["no pair"], 1);
});

test("a token twice needs its name twice", () => {
	const src = file(`\t-- {npc:1} Bob\n\t["{npc:1} and {npc:1}"] = "",\n`);
	const p = new Map([["Bob and Bob", "鲍勃和他"]]);
	const { text } = fillText(src, p, names(NAMES));
	assert.equal(text, src);
	const ok = fillText(src, new Map([["Bob and Bob", "鲍勃和鲍勃"]]), names(NAMES));
	assert.match(ok.text, /= "\{npc:1\}和\{npc:1\}",/);
});

test("longest name first", () => {
	const src = file(`\t-- {npc:1} Wolf · {npc:2} Grey Wolf\n\t["Kill {npc:1} and {npc:2}"] = "",\n`);
	const p = new Map([["Kill Wolf and Grey Wolf", "击杀灰狼和狼"]]);
	const { text } = fillText(src, p, names({ "npc:1": ["狼"], "npc:2": ["灰狼"] }));
	assert.match(text, /= "击杀\{npc:2\}和\{npc:1\}",/);
});

test("escapes round-trip", () => {
	const src = file(`\t["Say \\"hi\\"\\nnow"] = "",\n`);
	const p = new Map([['Say "hi"\nnow', '说"你好"\n现在']]);
	const { text, counts } = fillText(src, p, names({}));
	assert.equal(counts.translated, 1);
	assert.match(text, /= "说\\"你好\\"\\n现在",/);
});

test("no token comment: plain key", () => {
	const src = file(`\t-- Step 1\n\t["Go home"] = "",\n`);
	const { text } = fillText(src, new Map([["Go home", "回家"]]), names({}));
	assert.match(text, /\["Go home"\] = "回家",/);
});

test("a token comment belongs to its own key only", () => {
	const src = file(`${KILL}\t["Go home"] = "",\n`);
	const { text } = fillText(src, new Map([["Go home", "回家"]]), names({}));
	assert.match(text, /\["Go home"\] = "回家",/);
});

test("plural, as words", () => {
	const src = file(`\t-- {npc:1} Wolf (no name in this language: may be words)\n\t-- plural, as words: Wolfs = {npc:1} Wolf\n\t["Kill Wolfs"] = "",\n`);
	const { text, counts } = fillText(src, new Map([["Kill Wolfs", "击杀群狼"]]), names({}));
	assert.match(text, /= "击杀群狼",/);
	assert.equal(counts.translated, 1);
});

test("retired entries stay untouched", () => {
	const src = file(`\t["Go home"] = "",\n\n\t-- retired\n\t-- ["Go home"] = "",\n`);
	const { text } = fillText(src, new Map([["Go home", "回家"]]), names({}));
	assert.match(text, /\t-- \["Go home"\] = "",/);
});

test("what stays empty is listed with its step", () => {
	const { examples } = fillText(file(KILL), new Map(), names(NAMES));
	assert.deepEqual(examples, [{ step: 3, what: "no pair", line: "Kill Bob south of Testville" }]);
	const missing = fillText(file(KILL), pairs, names({ ...NAMES, "area:10": [] }));
	assert.deepEqual(missing.examples, [{ step: 3, what: "name not found", line: "Kill Bob south of Testville" }]);
});

const KELDRIC = file(`\t-- {npc:1} Keldric Boucher\n\t["Talk to {npc:1} through the wall"] = "",\n`);

test("short name in the guide", () => {
	const p = new Map([["Talk to Keldric through the wall", "隔着墙与凯尔德里克对话"], ["Talk to Bob", "与鲍勃对话"]]);
	const { text, counts } = fillText(KELDRIC, p, names({ "npc:1": ["凯尔德里克"] }));
	assert.match(text, /= "隔着墙与\{npc:1\}对话",/);
	assert.equal(counts.translated, 1);
});

test("two wildcard matches: no pair", () => {
	const p = new Map([["Talk to Keldric through the wall", "隔着墙与凯尔德里克对话"], ["Talk to Keld through the wall", "隔着墙与凯尔德对话"]]);
	const { text, counts } = fillText(KELDRIC, p, names({ "npc:1": ["凯尔德里克", "凯尔德"] }));
	assert.equal(text, KELDRIC);
	assert.equal(counts["no pair"], 1);
});

test("a token at the start matches as a wildcard too", () => {
	const src = file(`\t-- {npc:1} Keldric Boucher\n\t["{npc:1} waits (here)"] = "",\n`);
	const p = new Map([["Keldric waits (here)", "凯尔德里克在等"]]);
	const { text } = fillText(src, p, names({ "npc:1": ["凯尔德里克"] }));
	assert.match(text, /= "\{npc:1\}在等",/);
});
