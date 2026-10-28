import { test } from "node:test";
import assert from "node:assert/strict";
import { fillTexts, shapesOfTexts } from "../src/i18n/fill.mjs";

// Invented names only: Bob, Testville, Invented Vale, quest 100.
const names = (map) => (tok) => map[tok] ?? [];
const NAMES = { "npc:1": ["鲍勃"], "area:10": ["测试镇"] };
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

test("fillTexts: a shape's translation fills a key with other tokens", () => {
	const shapes = shapesOfTexts([new Map([["Talk to {npc:1}", "与{npc:1}对话"]])]);
	const text = { text: "Talk to {npc:2}", where: "Step 1", tokens: [["npc:2", "Alice"]], plurals: [] };
	const { translations, counts } = fillTexts([text], new Map(), names({}), { shapes });
	assert.equal(translations.get("Talk to {npc:2}"), "与{npc:2}对话");
	assert.equal(counts.translated, 1);
});

test("fillTexts: a name in the plural, as words, stands for its token", () => {
	const shapes = shapesOfTexts([new Map([["Kill {npc:1}", "击杀{npc:1}"]])]);
	const text = { text: "Kill Wolfs", where: "Step 1", tokens: [["npc:1", "Wolf"]], plurals: [["npc:1", "Wolfs"]] };
	const { translations } = fillTexts([text], new Map(), names({}), { shapes });
	assert.equal(translations.get("Kill Wolfs"), "击杀{npc:1}");
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

test("shapesOfTexts: a key with a newline or repeated token teaches nothing", () => {
	const shapes = shapesOfTexts([new Map([["Go to {npc:1}\nWait", "去{npc:1}\n等"], ["Ask {npc:1} and {npc:1}", "问{npc:1}"]])]);
	assert.equal(shapes.size, 0);
});
