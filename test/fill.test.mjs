import { test } from "node:test";
import assert from "node:assert/strict";
import { fillText, fillPack, shapesOf } from "../src/i18n/fill.mjs";
import { OWN } from "../src/i18n/own.mjs";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

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

test("a wildcard stays within its line and its name's length", () => {
	const src = file(`\t-- {npc:1} Keldric Boucher\n\t["Talk to {npc:1}\\nGo home"] = "",\n`);
	const across = new Map([["Talk to Keldric\nRun\nGo home", "与凯尔德里克对话\n跑\n回家"]]);
	assert.equal(fillText(src, across, names({ "npc:1": ["凯尔德里克"] })).counts["no pair"], 1);
	const long = new Map([["Talk to Keldric. Then wait for the boat\nGo home", "与凯尔德里克对话。然后等船\n回家"]]);
	assert.equal(fillText(src, long, names({ "npc:1": ["凯尔德里克"] })).counts["no pair"], 1);
});

test("fillPack with a relative clone and pack path", async () => {
	const clone = new URL("./fixtures/clone", import.meta.url).pathname;
	const pack = mkdtempSync(join(tmpdir(), "fillpack-"));
	const res = await fillPack({
		polestar: relative(process.cwd(), clone), pack: relative(process.cwd(), pack), locales: ["zhCN"],
		pairsByLocale: { zhCN: new Map([["Hello", "你好"]]) }, namesByLocale: { zhCN: () => [] },
	});
	assert.equal(res.counts.translated, 1);
	assert.equal(res.check.code, 0);
	assert.match(readFileSync(join(pack, "locales/zhCN/guides/x.lua"), "utf8"), /"Hello"\] = "你好"/);
});

// Shapes: a key that pairs with nothing takes the translation of a key of its shape.
const ZH = OWN.zhCN.lang;
const shapes = (lines, own) => shapesOf([file(lines)], own);
const LEARNT = `\t["Talk to {npc:1}"] = "与{npc:1}对话",\n\t["Kill {npc:1}."] = "击杀{npc:1}。",\n\t["Loot {item:5}"] = "拾取{item:5}",\n`;

test("a key takes its shape's translation, its own tokens put in", () => {
	const src = file(`\t-- {npc:2} Alice\n\t["Talk to {npc:2}"] = "",\n`);
	const { text, counts } = fillText(src, new Map(), names({}), { shapes: shapes(LEARNT) });
	assert.match(text, /= "与\{npc:2\}对话",/);
	assert.equal(counts.translated, 1);
});

test("a shape learns only from one-line keys whose tokens all come back once", () => {
	const s = shapes(`\t["Talk to {npc:1}"] = "对话",\n\t["Go to {npc:1}\\nWait"] = "去{npc:1}\\n等",\n\t["Ask {npc:1} and {npc:1}"] = "问{npc:1}",\n`);
	assert.equal(s.size, 0);
});

test("a shape's most frequent translation wins, the converter's own always", () => {
	const s = shapes(`${LEARNT}\t["Talk to {npc:3}"] = "和{npc:3}说话",\n\t["Talk to {npc:4}"] = "和{npc:4}说话",\n`, { "Kill {npc}.": "杀{#0}" });
	assert.equal(s.get("Talk to {npc}"), "和{#0}说话");
	assert.equal(s.get("Kill {npc}."), "杀{#0}");
});

test("tokens keep their places when the translation reorders them", () => {
	const s = shapes(`\t["Give {item:5} to {npc:1}"] = "把{item:5}交给{npc:1}",\n\t["Take {npc:1} to {area:9}"] = "在{area:9}带上{npc:1}",\n`);
	const src = file(`\t["Take {npc:2} to {area:8}"] = "",\n`);
	assert.match(fillText(src, new Map(), names({}), { shapes: s }).text, /= "在\{area:8\}带上\{npc:2\}",/);
});

test("a name in the plural, as words, stands for its singular's token", () => {
	const src = file(`\t-- plural, as words: Grey Wolfs = {npc:7} Grey Wolf\n\t["Kill Grey Wolfs."] = "",\n`);
	assert.match(fillText(src, new Map(), names({}), { shapes: shapes(LEARNT) }).text, /= "击杀\{npc:7\}。",/);
});

test("a list of names takes the shape of one, joined as the language lists", () => {
	const src = file(`\t["Kill {npc:2}, {npc:3} and {npc:4}."] = "",\n\t["Kill {npc:2} or {npc:3}."] = "",\n`);
	const { text } = fillText(src, new Map(), names({}), { shapes: shapes(LEARNT), lang: ZH });
	assert.match(text, /= "击杀\{npc:2\}、\{npc:3\}和\{npc:4\}。",/);
	assert.match(text, /= "击杀\{npc:2\}或\{npc:3\}。",/);
	assert.match(fillText(src, new Map(), names({}), { shapes: shapes(LEARNT) }).text, /\] = "",\n\t\["Kill \{npc:2\} or/, "no lists without the language");
});

test("a line of names alone is its own translation", () => {
	const src = file(`\t["[{item:5}]"] = "",\n`);
	assert.match(fillText(src, new Map(), names({})).text, /\["\[\{item:5\}\]"\] = "\[\{item:5\}\]",/);
});

test("a line of sentences, sentence by sentence", () => {
	const src = file(`\t["Kill {npc:2}. Loot {item:6}"] = "",\n\t["Kill {npc:2}. Dance"] = "",\n`);
	const { text, counts } = fillText(src, new Map(), names({}), { shapes: shapes(LEARNT), lang: ZH });
	assert.match(text, /= "击杀\{npc:2\}。拾取\{item:6\}",/);
	assert.match(text, /\["Kill \{npc:2\}. Dance"\] = "",/);
	assert.equal(counts.translated, 1);
});

test("a key of several lines is filled as far as its lines go", () => {
	const src = file(`\t["Talk to {npc:2}\\nDance"] = "",\n\t["Dance\\nSing"] = "",\n`);
	const { text, counts, examples } = fillText(src, new Map(), names({}), { shapes: shapes(LEARNT) });
	assert.match(text, /= "与\{npc:2\}对话\\nDance",/);
	assert.match(text, /\["Dance\\nSing"\] = "",/);
	assert.equal(counts["partly translated"], 1);
	assert.equal(counts["no pair"], 1);
	assert.equal(examples[0].what, "partly translated");
});

test("the converter's own sentences in Chinese", () => {
	const src = file(`\t["{npc:2} is elite: grouping up is advised."] = "",\n`);
	const { text } = fillText(src, new Map(), names({}), { shapes: shapesOf([], OWN.zhCN.sentences) });
	assert.match(text, /= "\{npc:2\}是精英怪，建议组队。",/);
});
