import { test } from "node:test";
import assert from "node:assert/strict";
import { rxpLocales, rxpTranslations } from "../src/rxp/translations.mjs";
import { convertRxp } from "../src/rxp/run.mjs";

// Invented guides and data; no real guide text lives in this repo.
const data = {
	quests: { 1: { title: "A Thing", start: { npc: [201] }, end: { npc: [201] }, level: 2, minLevel: 1, objectives: [] } },
	npcs: { 201: { name: "Bob", spawns: { 1: { pts: [[10, 10]] } }, rank: 0 } },
	items: {}, objects: {}, zones: { 1: { name: "Testville" } },
	frames: { forever: { 1: { left: 100, right: 0, top: 100, bottom: 0 } }, era: {} },
	races: null, inns: [], flights: [], journal: new Map(), hasProfessions: false,
	npcByName: new Map([["bob", [{ id: 201, name: "Bob", spawns: { 1: { pts: [[10, 10]] } }, rank: 0 }]]]),
};
const EN = `RXPGuides.RegisterGuide([[
#name 1-6 Testville
step
    >>Walk to the old mill
    .goto 1,10,10
]])
`;
const TR = EN.replace("Walk to the old mill", "走到老磨坊");
const files = {
	"RXPGuides/Guides/forever/Testville.lua": EN,
	"RXPGuides/lang/Guides-zhCN/GuideList-forever.xml": '<Script file="forever\\Testville.lua"/>',
	"RXPGuides/lang/Guides-zhCN/forever/Testville.lua": TR,
};
const lower = new Map(Object.entries(files).map(([p, t]) => [p.toLowerCase(), t]));
const read = async (p) => lower.get(p.toLowerCase()) ?? null;

test("the locales RXP ships a guide list in", () => {
	assert.deepEqual(rxpLocales([...lower.keys(), "rxpguides/lang/guides-dede/guidelist-forever.xml", "rxpguides/guides/guidelist-forever.xml"]), ["deDE", "zhCN"]);
});

test("a text of the compiled pack takes RXP's translation", async () => {
	const run = { ...convertRxp([{ path: "Guides/forever/Testville.lua", text: EN }], data, { packId: "mine" }), files: [{ path: "Guides/forever/Testville.lua", text: EN }] };
	assert.equal(run.guides.length, 1);
	const texts = { pack: [], guides: { "mine/x": [{ text: "Walk to the old mill", where: "Step 1", tokens: [], plurals: [] }, { text: "Never said", where: "Step 1", tokens: [], plurals: [] }] } };
	const r = await rxpTranslations({ read, paths: [...lower.keys()], run, locale: "zhCN", texts, namesOf: () => [] });
	assert.deepEqual(r.translations.guides["mine/x"], { "Walk to the old mill": "走到老磨坊" });
	assert.equal(r.counts.translated, 1);
	assert.equal(r.counts["no pair"], 1);
});
