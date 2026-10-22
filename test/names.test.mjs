import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { loadNames, withPaired } from "../src/i18n/names.mjs";

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
