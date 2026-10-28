import { test } from "node:test";
import assert from "node:assert/strict";
import { fillTexts, shapesOfTexts } from "../src/i18n/fill.mjs";
import { OWN } from "../src/i18n/own.mjs";

// Invented names only: Bob, Testville, Invented Vale, quest 100.
const names = (map) => (tok) => map[tok] ?? [];
const NAMES = { "npc:1": ["鲍勃"], "area:10": ["测试镇"] };
const entry = (key, extra = {}) => ({ text: key, where: "Step 1", tokens: [], plurals: [], ...extra });
const KILL = { text: "Kill {npc:1} south of {area:10}", where: "Step 3: Kill the Bob", tokens: [["npc:1", "Bob"], ["area:10", "Testville"]], plurals: [] };
const pairs = new Map([["Kill Bob south of Testville", "在测试镇南边击杀鲍勃"]]);

test("fillTexts: a text gets its translation keyed by its key", () => {
	const { translations, counts, examples } = fillTexts([KILL], pairs, names(NAMES));
	assert.deepEqual([...translations], [["Kill {npc:1} south of {area:10}", "在{area:10}南边击杀{npc:1}"]]);
	assert.equal(counts.translated, 1);
	assert.deepEqual(examples, []);
});

test("fillTexts: a name not found is counted with its step", () => {
	const { translations, counts, examples } = fillTexts([KILL], pairs, names({ ...NAMES, "area:10": [] }));
	assert.equal(translations.size, 0);
	assert.equal(counts["name not found"], 1);
	assert.deepEqual(examples, [{ step: 3, what: "name not found", line: "Kill Bob south of Testville" }]);
});

test("fillTexts: a text without a pair, under Guide, has no step", () => {
	const guide = { ...KILL, where: "Guide" };
	const { translations, counts, examples } = fillTexts([guide], new Map(), names(NAMES));
	assert.equal(translations.size, 0);
	assert.equal(counts["no pair"], 1);
	assert.deepEqual(examples, [{ step: null, what: "no pair", line: "Kill Bob south of Testville" }]);
});

test("fillTexts: a text without a Step or Guide comment has no step", () => {
	const { examples } = fillTexts([{ ...KILL, where: undefined }], new Map(), names(NAMES));
	assert.equal(examples[0].step, null);
});

test("fillTexts: a kept translation is never changed and counts as kept", () => {
	const kept = new Map([["Kill {npc:1} south of {area:10}", "我的"]]);
	const { translations, counts } = fillTexts([KILL], pairs, names(NAMES), { kept });
	assert.equal(translations.size, 0);
	assert.equal(counts.kept, 1);
	assert.equal(counts.translated, 0);
});

test("fillTexts: a key of several lines is partly translated", () => {
	const text = { text: "Talk to {npc:1}\nWait", where: "Step 2: Invented Vale", tokens: [["npc:1", "Bob"]], plurals: [] };
	const { translations, counts, examples } = fillTexts([text], new Map([["Talk to Bob", "与鲍勃对话"]]), names(NAMES));
	assert.equal(translations.get(text.text), "与{npc:1}对话\nWait");
	assert.equal(counts["partly translated"], 1);
	assert.deepEqual(examples, [{ step: 2, what: "partly translated", line: "Talk to Bob\nWait" }]);
});

test("fillTexts: each entry of the list is counted, the same key twice too", () => {
	const quest = { text: "Quest 100 at {npc:1}", where: "Guide", tokens: [["npc:1", "Bob"]], plurals: [] };
	const { counts } = fillTexts([quest, quest], new Map([["Quest 100 at Bob", "在鲍勃处接取任务100"]]), names(NAMES));
	assert.equal(counts.translated, 2);
});

test("fillTexts: the converter's own sentences in Chinese", () => {
	const { translations } = fillTexts([entry("{npc:2} is elite: grouping up is advised.")], new Map(), names({}), { shapes: shapesOfTexts([], OWN.zhCN.sentences) });
	assert.equal(translations.get("{npc:2} is elite: grouping up is advised."), "{npc:2}是精英怪，建议组队。");
});

test("shapesOfTexts: templates from maps, the most frequent translation wins", () => {
	const shapes = shapesOfTexts([
		[["Talk to {npc:1}", "对话{npc:1}"]],
		[["Talk to {npc:1}", "与{npc:1}对话"], ["Talk to {npc:2}", "与{npc:2}对话"]],
	]);
	assert.equal(shapes.get("Talk to {npc}"), "与{#0}对话");
});

test("shapesOfTexts: the converter's own sentences always win", () => {
	const shapes = shapesOfTexts([new Map([["Talk to {npc:1}", "与{npc:1}对话"]])], { "Talk to {npc}": "同{#0}说话" });
	assert.equal(shapes.get("Talk to {npc}"), "同{#0}说话");
});

test("a token twice needs its name twice", () => {
	const src = entry("{npc:1} and {npc:1}", { tokens: [["npc:1", "Bob"]] });
	const { translations } = fillTexts([src], new Map([["Bob and Bob", "鲍勃和他"]]), names(NAMES));
	assert.equal(translations.size, 0);
	const ok = fillTexts([src], new Map([["Bob and Bob", "鲍勃和鲍勃"]]), names(NAMES));
	assert.equal(ok.translations.get(src.text), "{npc:1}和{npc:1}");
});

test("longest name first", () => {
	const src = entry("Kill {npc:1} and {npc:2}", { tokens: [["npc:1", "Wolf"], ["npc:2", "Grey Wolf"]] });
	const p = new Map([["Kill Wolf and Grey Wolf", "击杀灰狼和狼"]]);
	const { translations } = fillTexts([src], p, names({ "npc:1": ["狼"], "npc:2": ["灰狼"] }));
	assert.equal(translations.get(src.text), "击杀{npc:2}和{npc:1}");
});

test("quotes and a newline come back as they are", () => {
	const key = 'Say "hi"\nnow';
	const { translations, counts } = fillTexts([entry(key)], new Map([[key, '说"你好"\n现在']]), names({}));
	assert.equal(counts.translated, 1);
	assert.equal(translations.get(key), '说"你好"\n现在');
});

test("no token list: plain key", () => {
	const { translations } = fillTexts([entry("Go home")], new Map([["Go home", "回家"]]), names({}));
	assert.equal(translations.get("Go home"), "回家");
});

test("a token list belongs to its own text only", () => {
	const { translations } = fillTexts([KILL, entry("Go home")], new Map([["Go home", "回家"]]), names({}));
	assert.equal(translations.get("Go home"), "回家");
});

test("plural, as words", () => {
	const src = entry("Kill Wolfs", { tokens: [["npc:1", "Wolf"]], plurals: [["npc:1", "Wolf"]] });
	const { translations, counts } = fillTexts([src], new Map([["Kill Wolfs", "击杀群狼"]]), names({}));
	assert.equal(translations.get("Kill Wolfs"), "击杀群狼");
	assert.equal(counts.translated, 1);
});

const KELDRIC = entry("Talk to {npc:1} through the wall", { tokens: [["npc:1", "Keldric Boucher"]] });

test("short name in the guide", () => {
	const p = new Map([["Talk to Keldric through the wall", "隔着墙与凯尔德里克对话"], ["Talk to Bob", "与鲍勃对话"]]);
	const { translations, counts } = fillTexts([KELDRIC], p, names({ "npc:1": ["凯尔德里克"] }));
	assert.equal(translations.get(KELDRIC.text), "隔着墙与{npc:1}对话");
	assert.equal(counts.translated, 1);
});

test("two wildcard matches: no pair", () => {
	const p = new Map([["Talk to Keldric through the wall", "隔着墙与凯尔德里克对话"], ["Talk to Keld through the wall", "隔着墙与凯尔德对话"]]);
	const { translations, counts } = fillTexts([KELDRIC], p, names({ "npc:1": ["凯尔德里克", "凯尔德"] }));
	assert.equal(translations.size, 0);
	assert.equal(counts["no pair"], 1);
});

test("a token at the start matches as a wildcard too", () => {
	const src = entry("{npc:1} waits (here)", { tokens: [["npc:1", "Keldric Boucher"]] });
	const p = new Map([["Keldric waits (here)", "凯尔德里克在等"]]);
	const { translations } = fillTexts([src], p, names({ "npc:1": ["凯尔德里克"] }));
	assert.equal(translations.get(src.text), "{npc:1}在等");
});

test("a wildcard stays within its line and its name's length", () => {
	const src = entry("Talk to {npc:1}\nGo home", { tokens: [["npc:1", "Keldric Boucher"]] });
	const across = new Map([["Talk to Keldric\nRun\nGo home", "与凯尔德里克对话\n跑\n回家"]]);
	assert.equal(fillTexts([src], across, names({ "npc:1": ["凯尔德里克"] })).counts["no pair"], 1);
	const long = new Map([["Talk to Keldric. Then wait for the boat\nGo home", "与凯尔德里克对话。然后等船\n回家"]]);
	assert.equal(fillTexts([src], long, names({ "npc:1": ["凯尔德里克"] })).counts["no pair"], 1);
});

// Shapes: a key that pairs with nothing takes the translation of a key of its shape.
const ZH = OWN.zhCN.lang;
const learnt = (entries, own) => shapesOfTexts([entries], own);
const LEARNT = [["Talk to {npc:1}", "与{npc:1}对话"], ["Kill {npc:1}.", "击杀{npc:1}。"], ["Loot {item:5}", "拾取{item:5}"]];

test("a key takes its shape's translation, its own tokens put in", () => {
	const src = entry("Talk to {npc:2}", { tokens: [["npc:2", "Alice"]] });
	const { translations, counts } = fillTexts([src], new Map(), names({}), { shapes: learnt(LEARNT) });
	assert.equal(translations.get(src.text), "与{npc:2}对话");
	assert.equal(counts.translated, 1);
});

test("a shape learns only from one-line keys whose tokens all come back once", () => {
	const s = learnt([["Talk to {npc:1}", "对话"], ["Go to {npc:1}\nWait", "去{npc:1}\n等"], ["Ask {npc:1} and {npc:1}", "问{npc:1}"]]);
	assert.equal(s.size, 0);
});

test("a shape's most frequent translation wins, the converter's own always", () => {
	const s = learnt([...LEARNT, ["Talk to {npc:3}", "和{npc:3}说话"], ["Talk to {npc:4}", "和{npc:4}说话"]], { "Kill {npc}.": "杀{#0}" });
	assert.equal(s.get("Talk to {npc}"), "和{#0}说话");
	assert.equal(s.get("Kill {npc}."), "杀{#0}");
});

test("tokens keep their places when the translation reorders them", () => {
	const s = learnt([["Give {item:5} to {npc:1}", "把{item:5}交给{npc:1}"], ["Take {npc:1} to {area:9}", "在{area:9}带上{npc:1}"]]);
	const { translations } = fillTexts([entry("Take {npc:2} to {area:8}")], new Map(), names({}), { shapes: s });
	assert.equal(translations.get("Take {npc:2} to {area:8}"), "在{area:8}带上{npc:2}");
});

test("a name in the plural, as words, stands for its singular's token", () => {
	const src = entry("Kill Grey Wolfs.", { plurals: [["npc:7", "Grey Wolf"]] });
	const { translations } = fillTexts([src], new Map(), names({}), { shapes: learnt(LEARNT) });
	assert.equal(translations.get(src.text), "击杀{npc:7}。");
});

test("a list of names takes the shape of one, joined as the language lists", () => {
	const and = entry("Kill {npc:2}, {npc:3} and {npc:4}.");
	const or = entry("Kill {npc:2} or {npc:3}.");
	const { translations } = fillTexts([and, or], new Map(), names({}), { shapes: learnt(LEARNT), lang: ZH });
	assert.equal(translations.get(and.text), "击杀{npc:2}、{npc:3}和{npc:4}。");
	assert.equal(translations.get(or.text), "击杀{npc:2}或{npc:3}。");
	assert.equal(fillTexts([and, or], new Map(), names({}), { shapes: learnt(LEARNT) }).translations.size, 0, "no lists without the language");
});

test("a line of names alone is its own translation", () => {
	const { translations } = fillTexts([entry("[{item:5}]")], new Map(), names({}));
	assert.equal(translations.get("[{item:5}]"), "[{item:5}]");
});

test("a line of sentences, sentence by sentence", () => {
	const yes = entry("Kill {npc:2}. Loot {item:6}");
	const no = entry("Kill {npc:2}. Dance");
	const { translations, counts } = fillTexts([yes, no], new Map(), names({}), { shapes: learnt(LEARNT), lang: ZH });
	assert.equal(translations.get(yes.text), "击杀{npc:2}。拾取{item:6}");
	assert.equal(translations.has(no.text), false);
	assert.equal(counts.translated, 1);
});

test("a key of several lines is filled as far as its lines go", () => {
	const partly = entry("Talk to {npc:2}\nDance");
	const none = entry("Dance\nSing");
	const { translations, counts, examples } = fillTexts([partly, none], new Map(), names({}), { shapes: learnt(LEARNT) });
	assert.equal(translations.get(partly.text), "与{npc:2}对话\nDance");
	assert.equal(translations.has(none.text), false);
	assert.equal(counts["partly translated"], 1);
	assert.equal(counts["no pair"], 1);
	assert.equal(examples[0].what, "partly translated");
});

// A translator may spell a name their own way.
const LOOT = { text: "Kill {npc:1}. Loot him for [{item:5}]", where: "Step 2: Loot", tokens: [["npc:1", "Bob"], ["item:5", "Example Item"]], plurals: [] };
const LOOT_EN = "Kill Bob. Loot him for [Example Item]";

test("a name in brackets is the bracket at its place", () => {
	const p = new Map([[LOOT_EN, "击杀鲍勃，拾取[样品物]"]]);
	const { translations } = fillTexts([LOOT], p, names({ "npc:1": ["鲍勃"], "item:5": ["示例物品"] }));
	assert.equal(translations.get(LOOT.text), "击杀{npc:1}，拾取[{item:5}]");
	const none = fillTexts([LOOT], p, names({ "npc:1": ["鲍勃"] }));
	assert.equal(none.translations.get(LOOT.text), "击杀{npc:1}，拾取[{item:5}]", "also without a name in the data");
});

test("a name one character off counts once, never when it fits two places", () => {
	const plain = { ...LOOT, text: "Kill {npc:1}. Loot him for {item:5}" };
	const nm = names({ "npc:1": ["鲍勃特"], "item:5": ["示例物品"] });
	const one = fillTexts([plain], new Map([["Kill Bob. Loot him for Example Item", "击杀鲍伯特，拾取示例物品"]]), nm);
	assert.equal(one.translations.get(plain.text), "击杀{npc:1}，拾取{item:5}");
	const two = fillTexts([plain], new Map([["Kill Bob. Loot him for Example Item", "击杀鲍伯特和鲍勃丁，拾取示例物品"]]), nm);
	assert.equal(two.counts["name not found"], 1);
});
