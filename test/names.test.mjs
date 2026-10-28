import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withPaired, namesFrom } from "../src/i18n/names.mjs";

// The fixture clone's names files, laid out as the web page hosts them (names/<locale>/).
const base = new URL("./fixtures/clone/", import.meta.url).pathname;
const BUILD = "1.60.1.1";
const hosted = {
	"names/zhCN/Names.lua": "addon/Polestar_zhCN/Names.lua",
	"names/zhCN/L.lua": "addon/Polestar/Locales/zhCN.lua",
	"names/zhCN/AreaTable.csv": `data/sources/wago/${BUILD}/zhCN/AreaTable.csv`,
	"names/zhCN/UiMap.csv": `data/sources/wago/${BUILD}/zhCN/UiMap.csv`,
	"names/zhCN/SpellName.csv": `data/sources/wago/${BUILD}/zhCN/SpellName.csv`,
};
const load = () => namesFrom(async (p) => (hosted[p] ? readFileSync(join(base, hosted[p]), "utf8") : null), "zhCN");

test("names from the names pack", async () => {
	const namesOf = await load();
	assert.deepEqual(namesOf("npc:1", "Bob"), ["鲍勃"]);
	assert.deepEqual(namesOf("npc:3", "x"), ["第二块"]);
	assert.deepEqual(namesOf("npc:2", "x"), ['说"你好"的人']);
	assert.deepEqual(namesOf("item:7", "Sword"), ["测试剑"]);
	assert.deepEqual(namesOf("quest:9", "Q"), ["第一行\n第二行]]%"], "%XX and a long bracket of its own level");
});

test("area, zone and spell from the cached client tables", async () => {
	const namesOf = await load();
	assert.deepEqual(namesOf("area:10", "Test Town"), ["测试镇"]);
	assert.deepEqual(namesOf("zone:1429", "Test Forest"), ["测试森林"]);
	assert.deepEqual(namesOf("spell:5", "Battle Shout"), ["战斗怒吼"]);
});

test("skill from L", async () => {
	const namesOf = await load();
	assert.deepEqual(namesOf("skill:164", "Mining"), ["采矿"]);
	assert.deepEqual(namesOf("skill:1", "Herbalism"), []);
});

test("unknown id gives []", async () => {
	const namesOf = await load();
	assert.deepEqual(namesOf("npc:999", "Nobody"), []);
	assert.deepEqual(namesOf("area:999", "Nowhere"), []);
	assert.deepEqual(namesOf("bogus:1", "x"), []);
});

test("paired names come after the pack's", async () => {
	const namesOf = withPaired(await load(), new Map([["Bob", "鲍勃先生"], ["Same", "鲍勃"]]));
	assert.deepEqual(namesOf("npc:1", "Bob"), ["鲍勃", "鲍勃先生"]);
	assert.deepEqual(namesOf("npc:1", "Same"), ["鲍勃"]);
	assert.deepEqual(namesOf("npc:999", "Bob"), ["鲍勃先生"]);
	assert.deepEqual(namesOf("npc:999", "Other"), []);
});

// Invented names only: Bob/鲍勃, Testville, a test sword.
const files = {
	"names/deDE/Names.lua": 'R("npc", 1, 1, [[\n1\tBobby (de)\n]])\n',
	"names/deDE/L.lua": ['L["Mining"] = "Bergbau"', '-- L["Herbalism"] = "Kräuterkunde"'].join("\n"),
	"names/deDE/AreaTable.csv": 'ID,AreaName_lang\n10,Testville\n11,"Test, Hill"\n',
	"names/deDE/UiMap.csv": 'Name_lang,ID\nTestforest,1429\n',
	"names/deDE/SpellName.csv": 'ID,Name_lang\n5,"Battle Shout (de)"\n6,\n',
};
const fromMap = (map) => async (path) => (path in map ? map[path] : null);

test("namesFrom reads the pack, L and client tables through read", async () => {
	const namesOf = await namesFrom(fromMap(files), "deDE");
	assert.deepEqual(namesOf("npc:1", "Bob"), ["Bobby (de)"]);
	assert.deepEqual(namesOf("npc:2", "x"), []);
	assert.deepEqual(namesOf("item:7", "Sword"), []);
	assert.deepEqual(namesOf("skill:164", "Mining"), ["Bergbau"]);
	assert.deepEqual(namesOf("skill:1", "Herbalism"), []); // commented out
	assert.deepEqual(namesOf("area:10", "Testville"), ["Testville"]);
	assert.deepEqual(namesOf("area:11", "x"), ["Test, Hill"]);
	assert.deepEqual(namesOf("zone:1429", "x"), ["Testforest"]);
	assert.deepEqual(namesOf("spell:5", "Battle Shout"), ["Battle Shout (de)"]);
	assert.deepEqual(namesOf("spell:6", "Empty"), []); // an empty name is no name
	assert.deepEqual(namesOf("area:999", "Nowhere"), []);
	assert.equal(namesOf.clientTables, null);
});

test("a missing file gives no names of its kind, and clientTables says which tables", async () => {
	const onlyPack = { "names/zhCN/Names.lua": 'R("npc", 1, 2, [[\n1\t鲍勃\n2\t说"你好"的人\n]])\nR("item", 7, 7, [[\n7\t测试剑\n]])\n' };
	const namesOf = await namesFrom(fromMap(onlyPack), "zhCN");
	assert.deepEqual(namesOf("npc:1", "Bob"), ["鲍勃"]);
	assert.deepEqual(namesOf("npc:2", "x"), ['说"你好"的人']);
	assert.deepEqual(namesOf("item:7", "Sword"), ["测试剑"]);
	assert.deepEqual(namesOf("skill:164", "Mining"), []);
	assert.deepEqual(namesOf("area:10", "Testville"), []);
	assert.equal(namesOf.clientTables, "missing AreaTable, UiMap, SpellName in names/zhCN/");
});

test("an empty table file counts as missing; a complete set has clientTables null", async () => {
	const emptyAreas = { ...files, "names/deDE/AreaTable.csv": "\n" };
	const namesOf = await namesFrom(fromMap(emptyAreas), "deDE");
	assert.deepEqual(namesOf("area:10", "x"), []);
	assert.match(namesOf.clientTables, /AreaTable/);
	const full = { ...files, "names/deDE/UiMap.csv": files["names/deDE/UiMap.csv"], "names/deDE/SpellName.csv": files["names/deDE/SpellName.csv"] };
	assert.equal((await namesFrom(fromMap(full), "deDE")).clientTables, null);
});
