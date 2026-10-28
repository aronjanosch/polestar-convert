import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { loadNames } from "../src/node/names.mjs";
import { withPaired, namesFrom } from "../src/i18n/names.mjs";

const clone = new URL("./fixtures/clone/", import.meta.url).pathname;
const BUILD = "1.60.1.1";

// A stand-in for the clone's wago.js that reads the fixture CSVs (no fetch, no local clone).
const csv = (text) => {
	const [head, ...lines] = text.trim().split("\n");
	const keys = head.split(",");
	return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [keys[i], v])));
};
const wago = {
	pickBuild: async () => ({ build: BUILD, warnings: [] }),
	cachedTable: async ({ sourcesDir, build, table, locale }) => {
		const file = join(sourcesDir, "wago", build, ...(locale ? [locale] : []), `${table}.csv`);
		if (!existsSync(file)) throw new Error(`missing ${file}`);
		return csv(readFileSync(file, "utf8"));
	},
};

const load = (opts = {}) => loadNames(clone, "zhCN", { offline: true, wago, ...opts });

test("names from the names pack", async () => {
	const namesOf = await load();
	assert.deepEqual(namesOf("npc:1", "Bob"), ["鲍勃"]);
	assert.deepEqual(namesOf("npc:3", "x"), ["第二块"]);
	assert.deepEqual(namesOf("npc:2", "x"), ['说"你好"的人']);
	assert.deepEqual(namesOf("item:7", "Sword"), ["测试剑"]);
	assert.deepEqual(namesOf("quest:9", "Q"), ["第一行\n第二行\\"]);
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

test("a failing client table gives [] and is logged once", async () => {
	const logged = [];
	const broken = { ...wago, cachedTable: async () => { throw new Error("offline"); } };
	const namesOf = await load({ wago: broken, log: (m) => logged.push(m) });
	assert.deepEqual(namesOf("area:10", "x"), []);
	assert.deepEqual(namesOf("npc:1", "Bob"), ["鲍勃"]);
	assert.equal(logged.length, 1);
	assert.match(logged[0], /offline/);
});

test("paired names come after the pack's", async () => {
	const namesOf = withPaired(await load(), new Map([["Bob", "鲍勃先生"], ["Same", "鲍勃"]]));
	assert.deepEqual(namesOf("npc:1", "Bob"), ["鲍勃", "鲍勃先生"]);
	assert.deepEqual(namesOf("npc:1", "Same"), ["鲍勃"]);
	assert.deepEqual(namesOf("npc:999", "Bob"), ["鲍勃先生"]);
	assert.deepEqual(namesOf("npc:999", "Other"), []);
});

test("a relative clone path (no ./) works, and a failing client table says why", async () => {
	const rel = relative(process.cwd(), clone.replace(/\/$/, ""));
	const namesOf = await loadNames(rel, "zhCN", { offline: true }); // the clone's own wago.js, through require
	assert.deepEqual(namesOf("npc:1", "Bob"), ["鲍勃"]);
	assert.match(namesOf.clientTables, /no network/);
	assert.equal((await load()).clientTables, null);
});

// Invented names only: Bob/鲍勃, Testville, a test sword.
const files = {
	"names/deDE/Names.lua": [
		'add("deDE", "npc", {',
		'[1]="Bobby (de)",',
		'})',
		'add("zhCN", "npc", {',
		'[1]="鲍勃",',
		'[2]="说\\"你好\\"的人",',
		'})',
		'add("zhCN", "item", {',
		'[7]="测试剑",',
		'})',
	].join("\n"),
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
	assert.deepEqual(namesOf("item:7", "Sword"), []); // the pack's zhCN rows are not deDE's
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
	const onlyPack = { "names/zhCN/Names.lua": ['add("zhCN", "npc", {', '[1]="鲍勃",', '[2]="说\\"你好\\"的人",', '})', 'add("zhCN", "item", {', '[7]="测试剑",', '})'].join("\n") };
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

test("namesFrom and loadNames agree on the fixture clone", async () => {
	const fixture = {};
	const base = new URL("./fixtures/clone/", import.meta.url).pathname;
	const copies = {
		"names/zhCN/Names.lua": "addon/Polestar_Names_zhCN/Names.lua",
		"names/zhCN/L.lua": "addon/Polestar/Locales/zhCN.lua",
		"names/zhCN/AreaTable.csv": `data/sources/wago/${BUILD}/zhCN/AreaTable.csv`,
		"names/zhCN/UiMap.csv": `data/sources/wago/${BUILD}/zhCN/UiMap.csv`,
		"names/zhCN/SpellName.csv": `data/sources/wago/${BUILD}/zhCN/SpellName.csv`,
	};
	for (const [out, src] of Object.entries(copies)) fixture[out] = readFileSync(join(base, src), "utf8");
	const web = await namesFrom(fromMap(fixture), "zhCN");
	const node = await load();
	for (const token of ["npc:1", "npc:2", "npc:3", "item:7", "quest:9", "area:10", "zone:1429", "spell:5", "npc:999", "area:999"]) {
		assert.deepEqual(web(token, "Bob"), node(token, "Bob"), token);
	}
	assert.deepEqual(web("skill:164", "Mining"), node("skill:164", "Mining"));
	assert.equal(web.clientTables, null);
});
