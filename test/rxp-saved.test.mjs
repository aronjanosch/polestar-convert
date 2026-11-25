// RXP's imported guides, which the addon keeps DEFLATE-packed in the account's
// SavedVariables: the SavedVariables reader, the guide texts it yields and how a run
// picks the file up. Invented data and guide text only; the packed entries are made
// with `node:zlib`, the same raw DEFLATE the addon packs them with.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { parseSavedVariables, savedGuides } from "../src/rxp/saved.mjs";
import { convertAddons, savedVariablePaths } from "../src/core.mjs";
import { Report } from "../src/ir.mjs";
import { loadData } from "../src/data.mjs";

const text = (s) => new TextEncoder().encode(s);
const concat = (...parts) => new Uint8Array(parts.flatMap((p) => [...p]));
// A Lua string as the game writes it: printable ASCII as itself, quote and backslash
// named, every other byte as `\ddd` (`raw`: bytes of 128 and above as themselves).
const luaString = (bytes, raw = false) => concat(
	text('"'),
	...[...bytes].map((b) => b === 34 ? text('\\"') : b === 92 ? text("\\\\")
		: b >= 32 && b < 127 ? Uint8Array.of(b)
		: raw && b >= 128 ? Uint8Array.of(b)
		: text(`\\${String(b).padStart(3, "0")}`)),
	text('"'),
);
// What RXP caches: the guide's lines with the account's marker comment before them, packed.
const pack = (guide, marker = "123456789") => new Uint8Array(deflateRawSync(Buffer.from(`--${marker}\n${guide}`, "utf8")));
// The `guides` entry, its key the addon numbers (`|1`, `|2`, …) with each import.
const guideEntry = (n, key, packed, raw = false) => concat(
	text(`["${key}|${n}"] = {\n["groupOrContent"] = `), luaString(packed, raw),
	text(',\n["cache"] = true,\n["key"] = "'), text(key), text('",\n},\n'),
);
const savedVariables = (entries) => concat(
	text('\nRXPData = {\n["release"] = "v9.9.9",\n}\n'),
	text('RXPDB = {\n["profileKeys"] = {\n["Testa - PvE"] = "global",\n},\n["profiles"] = {\n["global"] = {\n["guides"] = {\n'),
	...entries,
	text('},\n},\n},\n}\n'),
	text('RXPSettings = {\n["profiles"] = {\n["Testa - PvE"] = {\n["framePositions"] = {\n["arrowFrame"] = {\n{\n"TOP",\n"UIParent",\n0,\n-1.5e-2,\n},\n},\n},\n},\n},\n}\n'),
	text('RXPString = nil\n'),
);

const GUIDE_A = `#group Invented Starter (A)
#name 1-3 Test Vale
<< Alliance
step
>>Accept the invented errand
.accept 1
step
>>Turn it in — "Grüße" from the invented mill
.turnin 1
`;
const GUIDE_B = `#group Invented Starter (H)
#name 1-3 Test Vale
<< Horde
step
>>Accept the invented errand of the other side
.accept 1
`;

test("parseSavedVariables: the game's dump, every value form", () => {
	const vars = parseSavedVariables(concat(
		text('Data = {\n["maxLoadTime"] = 4000,\n["off"] = false,\n["nothing"] = nil,\n["plain"] = "a\\116b",\n["hi"] = "caf\\233",\n'),
		text('["nested"] = {\n["in"] = "deep",\n[8] = true,\n"item", -- [1]\n},\nBare = 7,\n}\n'),
		text('Str = nil\n'),
	));
	assert.equal(vars.Data.maxLoadTime, 4000);
	assert.equal(vars.Data.off, false);
	assert.equal(vars.Data.nothing, null);
	assert.deepEqual([...vars.Data.plain], [97, 116, 98]); // \116, not "t"
	assert.deepEqual([...vars.Data.hi], [99, 97, 102, 233]);
	assert.deepEqual([...vars.Data.nested.in], [100, 101, 101, 112]);
	assert.equal(vars.Data.nested["8"], true);
	assert.deepEqual([...vars.Data.nested["1"]], [105, 116, 101, 109]);
	assert.equal(vars.Data.Bare, 7);
	assert.equal(vars.Str, null);
	assert.throws(() => parseSavedVariables(text('X = { ["k"] = @\n')), /cannot read the SavedVariables file/);
	assert.throws(() => parseSavedVariables(text('X = {\n["k"] = "ends mid-line\n')),
		/a SavedVariables string ends early/);
});

test("savedGuides: the imported guides as guide files, one copy of each", async () => {
	const report = new Report();
	const file = savedVariables([
		guideEntry(1, "Invented Starter (A)||1-3 Test Vale", pack(GUIDE_A)),
		// A second import of the same guide: one copy.
		guideEntry(2, "Invented Starter (A)||1-3 Test Vale", pack(GUIDE_A)),
		// Raw bytes beside the escaped form.
		guideEntry(1, "Invented Starter (H)||1-3 Test Vale", pack(GUIDE_B), true),
		// The addon's bit library hands the account hash out negative sometimes.
		guideEntry(1, "Invented Starter||1-3 Test Vale", pack(GUIDE_B, "-42"), true),
		// What is not a guide RXP would drop too.
		guideEntry(1, "Broken||no", new Uint8Array([1, 2, 3, 4, 5])),
		guideEntry(1, "No marker||text", new Uint8Array(deflateRawSync(Buffer.from("#name No Marker\nstep\n", "utf8")))),
	]);
	const files = await savedGuides([file], report);
	assert.equal(files.length, 3);
	assert.deepEqual(files.map((f) => f.path), ["SavedVariables/RXPGuides.lua", "SavedVariables/RXPGuides.lua", "SavedVariables/RXPGuides.lua"]);
	assert.match(files[0].text, /RegisterGuide\(\[\[--123456789\n#group Invented Starter \(A\)\n/);
	assert.ok(files[0].text.includes('>>Turn it in — "Grüße" from the invented mill'));
	assert.ok(files[1].text.includes("#group Invented Starter (H)"));
	assert.match(files[2].text, /\[\[---42\n/);
	assert.equal(report.counts.get("imported guide read (SavedVariables)"), 3);
	assert.equal(report.counts.get("imported guide held twice (one copy kept)"), 1);
	assert.equal(report.counts.get("imported guide not decodable (left out)"), 2);
	assert.equal(report.items.length, 2);
	// No RXPDB at all: nothing imported, nothing to read.
	assert.deepEqual(await savedGuides([text('RXPData = {\n}\nRXPString = nil\n')], new Report()), []);
	assert.deepEqual(await savedGuides([], new Report()), []);
});

test("convertAddons: imported guides convert beside the addon's own files", async () => {
	const reader = (files) => async (path) => files[path] ?? null;
	const data = await loadData(reader({
		"data/forever/quests.json": JSON.stringify({ 1: { title: "A Thing", start: { npc: [201] }, end: { npc: [201] }, level: 2, minLevel: 1, objectives: [] } }),
		"data/forever/npcs.json": JSON.stringify({ 201: { name: "Bob", spawns: { 1: { pts: [[10, 10]] } }, rank: 0 } }),
		"data/forever/zones.json": JSON.stringify({ 1: { name: "Testville" } }),
		"data/forever/map-frames.json": JSON.stringify({ forever: { 1: { left: 100, right: 0, top: 100, bottom: 0 } }, era: {} }),
		"data/forever/items.json": "{}",
		"data/forever/objects.json": "{}",
		"data/forever/races.json": JSON.stringify({ Human: { Alliance: { bit: 1, classes: ["WARRIOR"] } } }),
	}));
	const addons = {
		"RXPGuides/Guides/GuideList-forever.xml": '<Ui><Script file="Guides/forever/A.lua"/></Ui>',
		"RXPGuides/Guides/forever/A.lua": `RXPGuides.RegisterGuide([[
#group Invented Starter (A)
#name 3-5 Test Vale
<< Alliance
step
>>Accept the invented errand
.accept 1
]])`,
	};
	const withSaved = await convertAddons(reader(addons), data, null, { packId: "mine", sources: ["rxp"], savedVariables: [savedVariables([guideEntry(1, "Invented Starter (A)||1-3 Test Vale", pack(GUIDE_A))])] });
	assert.deepEqual(withSaved.rxp.guides.map((g) => g.slug), ["3-5-test-vale", "1-3-test-vale"]);
	assert.equal(withSaved.rxp.report.counts.get("imported guide read (SavedVariables)"), 1);
	// The addon's own files and no SavedVariables: unchanged.
	const plain = await convertAddons(reader(addons), data, null, { packId: "mine", sources: ["rxp"] });
	assert.deepEqual(plain.rxp.guides.map((g) => g.slug), ["3-5-test-vale"]);
	assert.ok(!plain.rxp.report.counts.has("imported guide read (SavedVariables)"));
});

test("savedVariablePaths: the WTF folder of the client whose AddOns the pick holds", () => {
	const wow = [
		"World of Warcraft/_forever_/Interface/AddOns/RXPGuides/Guides/GuideList-forever.xml",
		"World of Warcraft/_forever_/WTF/Account/54492#2/SavedVariables/RXPGuides.lua",
		"World of Warcraft/_forever_/WTF/Account/54492#2/SavedVariables/RXPGuides.lua.bak",
		"World of Warcraft/_forever_/WTF/Account/54492#2/SavedVariables/RXPCData.lua",
		"World of Warcraft/_forever_/WTF/Account/54492#2/Realm/Hero/SavedVariables/RXPGuides.lua",
		"World of Warcraft/_forever_/WTF/Account/Second Acc/SavedVariables/RXPGuides.lua",
		"World of Warcraft/_classic_beta_/Interface/AddOns/RXPGuides/Guides/GuideList-forever.xml",
		"World of Warcraft/_classic_beta_/WTF/Account/Beta/SavedVariables/RXPGuides.lua",
	];
	assert.deepEqual(savedVariablePaths(wow), [
		{ path: "world of warcraft/_forever_/wtf/account/54492#2/savedvariables/rxpguides.lua", index: 1 },
		{ path: "world of warcraft/_forever_/wtf/account/second acc/savedvariables/rxpguides.lua", index: 5 },
	]);
	// Without the AddOns the WTF folder alone is found; only AddOns is not.
	assert.deepEqual(savedVariablePaths(wow.filter((p) => !p.includes("Second Acc") && !p.includes("Hero")).slice(1, 4).concat(wow[7])),
		[{ path: "world of warcraft/_forever_/wtf/account/54492#2/savedvariables/rxpguides.lua", index: 0 }]);
	assert.deepEqual(savedVariablePaths(["RXPGuides/Guides/GuideList-forever.xml"]), []);
});
