// The pieces the web page needs that run in Node too: the ZIP writer, a new pack's
// files, the data files the converter reads, and the AddOns paths of a picked folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { zip, crc32 } from "../src/zip.mjs";
import { newPack, packIdProblem } from "../src/pack.mjs";
import { loadData, dataFiles } from "../src/data.mjs";
import { loadNames } from "../src/journey/names.mjs";
import { addonsPaths } from "../src/core.mjs";

// The entries of a ZIP, read back from its central directory.
function unzip(bytes) {
	const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let end = bytes.length - 22;
	while (v.getUint32(end, true) !== 0x06054b50) end--;
	const count = v.getUint16(end + 10, true);
	let at = v.getUint32(end + 16, true);
	const out = {};
	for (let i = 0; i < count; i++) {
		assert.equal(v.getUint32(at, true), 0x02014b50);
		const method = v.getUint16(at + 10, true), crc = v.getUint32(at + 16, true), size = v.getUint32(at + 20, true);
		assert.equal(method, 0, "stored");
		const nameLen = v.getUint16(at + 28, true), extra = v.getUint16(at + 30, true), comment = v.getUint16(at + 32, true);
		const local = v.getUint32(at + 42, true);
		const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen));
		const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
		const data = bytes.subarray(start, start + size);
		assert.equal(crc32(data), crc, `${name}: crc`);
		out[name] = new TextDecoder().decode(data);
		at += 46 + nameLen + extra + comment;
	}
	return out;
}

test("crc32 of a known text", () => {
	assert.equal(crc32(new TextEncoder().encode("hello")), 0x3610a686);
});

test("zip: files with UTF-8 names and text, read back", () => {
	const bytes = zip({ "my-guides/pack.json": "{}\n", "my-guides/guides/ä-1.guide": "step\n  accept 1 \"Grüße\"\n" });
	assert.ok(bytes instanceof Uint8Array);
	assert.deepEqual(unzip(bytes), { "my-guides/pack.json": "{}\n", "my-guides/guides/ä-1.guide": "step\n  accept 1 \"Grüße\"\n" });
});

test("newPack: a pack.json Polestar accepts and a README", () => {
	const files = newPack({ id: "my-guides", title: "My Guides", author: "Me" });
	assert.deepEqual(JSON.parse(files["pack.json"]), { id: "my-guides", title: "My Guides", author: "Me", version: "0.1.0", license: "Personal use: converted from guides you own" });
	assert.match(files["README.md"], /polestar\.js install/);
	assert.equal(packIdProblem("my-guides"), null);
	assert.match(packIdProblem("My Guides"), /lowercase/);
	assert.match(packIdProblem("polestar"), /reserved/);
});

test("dataFiles: every file loadData and loadNames read, by the builds travel.json names", async () => {
	const travel = { foreverBuild: "9.9.9", build: "1.1.1" };
	const files = dataFiles(travel);
	const asked = new Set();
	const read = async (p) => {
		asked.add(p);
		if (p === "data/forever/travel.json") return JSON.stringify(travel);
		if (p.endsWith(".csv")) return "ID,Name_lang,AreaName_lang,ParentAreaID\n";
		return p.endsWith("races.json") ? "null" : p.endsWith("npcs.json") ? "{}" : "{}";
	};
	const data = await loadData(read);
	await loadNames(read, data);
	assert.deepEqual([...asked].sort(), [...files].sort());
	assert.ok(files.includes("data/sources/wago/1.1.1/WMOAreaTable.csv"));
});

test("addonsPaths: the paths under Interface/AddOns of the files a folder pick gives", () => {
	// The AddOns folder itself, the client folder, or one addon folder picked.
	assert.deepEqual(addonsPaths(["AddOns/Journey/data/Guides/guides.html", "AddOns/Questie/x.lua"]),
		new Map([["journey/data/guides/guides.html", 0], ["questie/x.lua", 1]]));
	assert.deepEqual(addonsPaths(["_forever_/Interface/AddOns/RXPGuides/Guides/A.lua", "_forever_/WTF/Config.wtf"]),
		new Map([["rxpguides/guides/a.lua", 0]]));
	assert.deepEqual(addonsPaths(["RXPGuides/Guides/A.lua"]), new Map([["rxpguides/guides/a.lua", 0]]));
	assert.deepEqual(addonsPaths(["Interface/AddOns/Journey/a"]), new Map([["journey/a", 0]]));
	// The World of Warcraft folder: the Forever client's AddOns, not another client's.
	assert.deepEqual(addonsPaths(["WoW/_classic_era_/Interface/AddOns/Journey/a", "WoW/_forever_/Interface/AddOns/Journey/b"]),
		new Map([["journey/b", 1]]));
});

test("packZip: the whole pack in one folder named by its id, with a run report per source", async () => {
	const { packZip } = await import("../src/core.mjs");
	const { Report } = await import("../src/ir.mjs");
	const report = new Report();
	report.count("zone map set");
	const runs = { zygor: { guides: [{ slug: "h-a-1-4", text: "guide my-guides/h-a-1-4\n", stepsOut: 1 }], gaps: { "h-a-1-4.guide": [] }, settings: {}, report } };
	const files = unzip(packZip(runs, { id: "my-guides", title: "My Guides", author: "Me" }));
	assert.deepEqual(Object.keys(files).sort(), ["my-guides/README.md", "my-guides/guides/h-a-1-4.guide", "my-guides/pack.json", "my-guides/reports/zygor-gaps.json", "my-guides/reports/zygor-run.txt"]);
	assert.match(files["my-guides/reports/zygor-run.txt"], /1 zone map set/);
});
