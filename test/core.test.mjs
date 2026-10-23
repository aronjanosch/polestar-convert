// The core without file access: inputs come in through `read`, guides go out as text.
// Invented data and guide text only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData } from "../src/data.mjs";
import { readTable } from "../src/csv.mjs";
import { loadNames } from "../src/journey/names.mjs";
import { decodeSlot } from "../src/journey/parse.mjs";
import { convertZygor } from "../src/zygor/run.mjs";
import { convertJourney } from "../src/journey/run.mjs";
import { convertRxp, guideList, rxpRoute } from "../src/rxp/run.mjs";
import { findSources, convertAddons, packFiles } from "../src/core.mjs";

const reader = (files) => async (path) => files[path] ?? null;

const DATA = {
	"data/forever/quests.json": JSON.stringify({ 1: { title: "A Thing", start: { npc: [201] }, end: { npc: [201] }, level: 2, minLevel: 1, objectives: [] } }),
	"data/forever/npcs.json": JSON.stringify({ 201: { name: "Bob", spawns: { 1: { pts: [[10, 10]] } }, rank: 0 } }),
	"data/forever/zones.json": JSON.stringify({ 1: { name: "Testville" } }),
	"data/forever/map-frames.json": JSON.stringify({ forever: { 1: { left: 100, right: 0, top: 100, bottom: 0 } }, era: {} }),
	"data/forever/items.json": "{}",
	"data/forever/objects.json": "{}",
	"data/forever/races.json": JSON.stringify({ Orc: { Horde: { bit: 2, classes: ["WARRIOR"] } } }),
};
const FULL = {
	...DATA,
	"data/forever/travel.json": JSON.stringify({ foreverBuild: "9.9.9", build: "1.1.1", inns: [{ location: "Testville", map: 1, x: 5, y: 5, c: 0, area: 10 }], taxi: { nodes: [{ id: 7, short: "Testville", name: "Testville, Testlands", faction: 3, map: 1, x: 1, y: 1 }] } }),
	"data/forever/professions.json": "{}",
	"data/forever/codex/journal.json": JSON.stringify({ dungeons: [{ entrance: { map: 1, x: 2, y: 3 }, quests: [{ id: 1, start: { map: 1, x: 4, y: 4 } }] }] }),
	"data/sources/wago/9.9.9/AreaTable.csv": 'ID,AreaName_lang,ParentAreaID\n10,"Test, Town",1\n11,Old Mill,10\n',
	"data/sources/wago/9.9.9/SpellName.csv": "ID,Name_lang\n5,Battle Shout\n",
	"data/sources/wago/1.1.1/WMOAreaTable.csv": "ID,AreaName_lang\n3,Town Hall\n",
};

test("loadData takes its files from read", async () => {
	const data = await loadData(reader(FULL));
	assert.equal(data.quests[1].title, "A Thing");
	assert.equal(data.npcByName.get("bob")[0].name, "Bob");
	assert.deepEqual(data.areas.get(10), { name: "Test, Town", parent: 1 });
	assert.deepEqual(data.areas.get(11), { name: "Old Mill", parent: 10 });
	assert.equal(data.inns[0].location, "Testville");
	assert.equal(data.flights[0].short, "Testville");
	assert.equal(data.hasProfessions, true);
	assert.deepEqual(data.journal.get(1).entrance, { map: 1, x: 2, y: 3 });
});

test("loadData without the optional files", async () => {
	const data = await loadData(reader(DATA));
	assert.equal(data.areas.size, 0);
	assert.deepEqual(data.inns, []);
	assert.deepEqual(data.flights, []);
	assert.equal(data.hasProfessions, false);
	assert.equal(data.journal.size, 0);
});

test("readTable reads CSV text; none gives an empty table", () => {
	assert.deepEqual(readTable('ID,Name\n1,"a ""b"""\n', "ID", ["Name"]).get(1), { Name: 'a "b"' });
	assert.equal(readTable(null, "ID", ["Name"]).size, 0);
});

test("Journey's names take the client tables from read and the XP table as given", async () => {
	const data = await loadData(reader(FULL));
	const names = await loadNames(reader(FULL), data, [0, 400, 900]);
	assert.equal(names.area(11), "Old Mill");
	assert.equal(names.spell(5), "Battle Shout");
	assert.equal(names.wmo(3), "Town Hall");
	assert.equal(names.inn(10), "Testville");
	assert.equal(names.taxi(7).short, "Testville");
	assert.equal(names.levelXp(2), 900);
	assert.equal((await loadNames(reader(DATA), data)).levelXp(2), null);
});

test("decodeSlot reads base64 UTF-8 without Buffer", () => {
	const b64 = btoa(String.fromCharCode(...new TextEncoder().encode("{ \"Grüße\" }\r\n")));
	assert.equal(decodeSlot(`<html><p>${b64.slice(0, 6)}\n  ${b64.slice(6)}</p></html>`), '{ "Grüße" }\n');
	assert.equal(decodeSlot("<html></html>"), null);
});

const ZYGOR_H = `ZygorGuidesViewer:RegisterGuide("Leveling Guides\\\\Testville (1-4)",{
condition_suggested="function() return raceclass('Orc') end",
next="Leveling Guides\\\\Testville Two (4-6)",
},[[
step
accept A Thing##1 |goto Testville 10.0,10.0
step
turnin A Thing##1 |goto Testville 10.0,10.0
]])
ZygorGuidesViewer:RegisterGuide("Leveling Guides\\\\Testville Two (4-6)",{
},[[
step
accept A Thing##1 |goto Testville 10.0,10.0
]])
`;

test("convertZygor: guide text in, guides out", async () => {
	const data = await loadData(reader(FULL));
	const r = convertZygor({ horde: ZYGOR_H, alliance: "" }, data, { packId: "mine" });
	assert.deepEqual(r.guides.map((g) => g.slug), ["h-testville-1-4", "h-testville-two-4-6"]);
	assert.match(r.guides[0].text, /^  accept 1$/m);
	assert.match(r.guides[0].text, /h-testville-two-4-6/);
	assert.deepEqual(Object.keys(r.gaps), ["h-testville-1-4.guide", "h-testville-two-4-6.guide"]);
	assert.equal(convertZygor({ horde: ZYGOR_H, alliance: "" }, data, { packId: "mine", only: "nothing" }).guides.length, 0);
});

const slot = (lua) => `<html><body><p>${btoa(lua)}</p></body></html>`;
const JOURNEY = {
	"guides.html": slot(`{ { guideID = "H01T_FVR", slot = 1, description = "1-4 Testville", levels = "1-4", faction = "Horde" } }`),
	"0001.html": slot(`{
	{ id = "01-01", { { "Talk to Bob" }, { npc = 201 }, { accept = 1 } } },
	{ id = "01-02", { { "Hand in" }, { turnin = 1 } } },
}`),
};

test("convertJourney: slot files from read, guides out", async () => {
	const data = await loadData(reader(FULL));
	const names = await loadNames(reader(FULL), data);
	const r = await convertJourney(reader(JOURNEY), data, names, { packId: "mine" });
	assert.deepEqual(r.guides.map((g) => g.slug), ["h01t-testville"]);
	assert.match(r.guides[0].text, /^  accept 1$/m);
	assert.ok(r.gaps["h01t-testville.guide"]);
});

const RXP_A = `RXPGuides.RegisterGuide([[
#group RestedXP Forever Guide (H)
#subgroup Guide1-22
#name 1-4 Testville
#next 4-6 Testville Survival
<< Horde
step
    .accept 1 >>Accept A Thing
    .target Bob
step
    .turnin 1 >>Turn in A Thing
]])
RXPGuides.RegisterGuide([[
#group RestedXP Survival Guide (H)
#subgroup RXP Survival Guide 1-20
#name 4-6 Testville Survival
<< Horde
step
    .accept 1 >>Accept A Thing
]])`;

test("rxpRoute: the route a guide belongs to, by its group", () => {
	assert.equal(rxpRoute({ group: "RestedXP Forever Guide (A)", subgroup: "Guide1-20" }), "main");
	assert.equal(rxpRoute({ group: "RestedXP Forever Guide (A)", subgroup: "GuideMage" }), "mage");
	assert.equal(rxpRoute({ group: "RestedXP Horde class guide" }), "mage");
	assert.equal(rxpRoute({ group: "RestedXP Alliance class guide" }), "mage");
	assert.equal(rxpRoute({ group: "RestedXP Forever Dungeon Guide (H) << Horde", subgroup: "Dungeon Guide 1-22 << Horde" }), "dungeon");
	assert.equal(rxpRoute({ group: "RXP Dungeon Quest Guides (A)", subgroup: "15-30" }), "dungeon");
	assert.equal(rxpRoute({ group: "RestedXP Survival Guide (A)", subgroup: "RXP Survival Guide 1-20" }), "survival");
	assert.equal(rxpRoute({}), "main");
});

test("guideList: the files RXP's guide list loads, without Import.lua", () => {
	const xml = '<Ui>\n<Script file="Guides/Import.lua"/>\n\t<Script file="Guides/forever/A.lua"/>\n<Script file="Guides/SurvivalGuide/B C.lua"/>\n</Ui>';
	assert.deepEqual(guideList(xml), ["Guides/forever/A.lua", "Guides/SurvivalGuide/B C.lua"]);
});

test("convertRxp: files in, guides out; routes keep a route's guides and drop hand-offs out of it", async () => {
	const data = await loadData(reader(FULL));
	const all = convertRxp([{ path: "Guides/forever/A.lua", text: RXP_A }], data, { packId: "mine" });
	assert.deepEqual(all.guides.map((g) => g.slug), ["1-4-testville", "4-6-testville-survival"]);
	assert.match(all.guides[0].text, /4-6-testville-survival/);
	const speed = convertRxp([{ path: "Guides/forever/A.lua", text: RXP_A }], data, { packId: "mine", routes: ["main"] });
	assert.deepEqual(speed.guides.map((g) => g.slug), ["1-4-testville"]);
	assert.doesNotMatch(speed.guides[0].text, /4-6-testville-survival/);
	assert.equal(speed.guides[0].route, "main");
});

const ADDONS = {
	"RXPGuides/Guides/GuideList-forever.xml": '<Ui><Script file="Guides/forever/A.lua"/></Ui>',
	"RXPGuides/Guides/forever/A.lua": RXP_A,
	"Journey/data/Guides/guides.html": JOURNEY["guides.html"],
	"Journey/data/Guides/0001.html": JOURNEY["0001.html"],
	"ZygorGuidesViewerClassic/Guides-Classic/Leveling/ZygorLevelingHordeCLASSIC.lua": ZYGOR_H,
};

test("findSources: which guide addons the AddOns folder holds", async () => {
	assert.deepEqual(await findSources(reader(ADDONS)), ["rxp", "journey", "zygor"]);
	assert.deepEqual(await findSources(reader({ "Journey/data/Guides/guides.html": "x" })), ["journey"]);
	assert.deepEqual(await findSources(reader({})), []);
});

test("convertAddons + packFiles: every source found into one set of pack files", async () => {
	const data = await loadData(reader(FULL));
	const names = await loadNames(reader(FULL), data);
	const runs = await convertAddons(reader(ADDONS), data, names, { packId: "mine", routes: ["main"] });
	assert.deepEqual(Object.keys(runs), ["rxp", "journey", "zygor"]);
	const files = packFiles(runs);
	assert.deepEqual(Object.keys(files).sort(), [
		"guides/1-4-testville.guide", "guides/h-testville-1-4.guide", "guides/h-testville-two-4-6.guide", "guides/h01t-testville.guide",
		"reports/journey-gaps.json", "reports/zygor-gaps.json",
	]);
	assert.match(files["reports/zygor-gaps.json"], /"source": "Zygor Guide Viewer Classic \(local install\)"/);
	const only = await convertAddons(reader(ADDONS), data, names, { packId: "mine", sources: ["journey"] });
	assert.deepEqual(Object.keys(only), ["journey"]);
});
