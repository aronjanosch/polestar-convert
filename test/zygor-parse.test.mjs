import { test } from "node:test";
import assert from "node:assert/strict";
import { extractGuides, parseBody, refs } from "../src/zygor/parse.mjs";

// Invented guide text in Zygor's shape; nothing here is from a real guide.
const LUA = [
	'local X=1',
	'ZygorGuidesViewer:RegisterGuidePlaceholder("Leveling Guides\\\\Ignored (1-2)")',
	'ZygorGuidesViewer:RegisterGuide("Leveling Guides\\\\Testland (1-5)",{',
	'condition_visible=function() return raceclass(\'Human\'), level end,',
	'startlevel=1,',
	'description="A test, with comma.",',
	'next="Leveling Guides\\\\Otherland (5-9)",',
	'},[[',
	'defaultfor Human',
	'step',
	'talk Bob##10',
	'accept Q##100 |goto Zone/0 30.22,71.65',
	'step',
	'step',
	'kill Duskbat##1512, Young Scavenger##1508+',
	'|tip Be careful.',
	'stickystart "A"',
	'step',
	'collect 3 Thing##5 |q 7/1\t|only if Warlock',
	'|only if Scourge Warlock',
	'step',
	'Click Here |confirm',
	'\'|complete not haveq(5) |next "B"',
	'step',
	'label "A"',
	'goto Zone 1,2',
	'stickystop "A"',
	'step',
	'label "B"',
	']])',
	'ZygorGuidesViewer:RegisterGuide("Other",{',
	'hideif=not ZGV.IsClassicSoD,',
	'},[[',
	'step',
	'ding 5',
	']])',
].join("\r\n");

test("extractGuides: names, header keys, placeholder ignored", () => {
	const gs = extractGuides(LUA);
	assert.deepEqual(gs.map((g) => g.name), ["Leveling Guides\\Testland (1-5)", "Other"]);
	assert.equal(gs[0].header.next, "Leveling Guides\\Otherland (5-9)");
	assert.equal(gs[0].header.startlevel, 1);
	assert.equal(gs[0].header.description, "A test, with comma.");
	assert.equal(gs[0].header.condition_visible, "function() return raceclass('Human'), level end");
	assert.equal(gs[1].header.hideif, "not ZGV.IsClassicSoD");
	assert.equal(gs[1].header.next, undefined);
});

test("parseBody: steps, verbs, goto mods", () => {
	const steps = parseBody(extractGuides(LUA)[0].body);
	const s1 = steps[0];
	assert.equal(s1.no, 1);
	assert.deepEqual(s1.lines.map((l) => [l.verb, l.text]), [["talk", "Bob##10"], ["accept", "Q##100"]]);
	assert.deepEqual(s1.lines[1].mods, [{ name: "goto", args: "Zone/0 30.22,71.65" }]);
});

test("parseBody: an empty step is dropped, numbers stay in order", () => {
	const steps = parseBody(extractGuides(LUA)[0].body);
	assert.deepEqual(steps.map((s) => s.no), [1, 2, 3, 4, 5, 6]);
	assert.equal(steps[1].lines[0].verb, "kill");
	assert.deepEqual(steps[1].lines[1], { verb: null, text: "", mods: [{ name: "tip", args: "Be careful." }], raw: "|tip Be careful." });
});

test("parseBody: trailing and step-level only mods", () => {
	const s = parseBody(extractGuides(LUA)[0].body)[2];
	assert.deepEqual(s.lines[0].mods, [{ name: "q", args: "7/1" }, { name: "only", args: "if Warlock" }]);
	assert.equal(s.lines[1].verb, null);
	assert.equal(s.lines[1].text, "");
	assert.deepEqual(s.lines[1].mods, [{ name: "only", args: "if Scourge Warlock" }]);
});

test("parseBody: stickystart before a step lands in that step", () => {
	const steps = parseBody(extractGuides(LUA)[0].body);
	assert.deepEqual(steps[2].starts, ["A"]);
	assert.deepEqual(steps[1].starts, []);
});

test("parseBody: label and stickystop", () => {
	const steps = parseBody(extractGuides(LUA)[0].body);
	assert.equal(steps[4].label, "A");
	assert.equal(steps[4].lines.length, 1);
	assert.deepEqual(steps[5].stops, ["A"]);
	assert.equal(steps[5].label, "B");
	assert.equal(steps[5].lines.length, 0);
});

test("parseBody: a ' line continues the line before it", () => {
	const s = parseBody(extractGuides(LUA)[0].body)[3];
	assert.equal(s.lines.length, 1);
	assert.deepEqual(s.lines[0].mods, [
		{ name: "confirm", args: "" },
		{ name: "complete", args: "not haveq(5)" },
		{ name: "next", args: '"B"' },
	]);
	assert.equal(s.lines[0].verb, null);
	assert.equal(s.lines[0].text, "Click Here");
});

test("refs: Name##id lists, + dropped", () => {
	assert.deepEqual(refs("kill Duskbat##1512, Young Scavenger##1508+"), [
		{ name: "Duskbat", id: 1512 },
		{ name: "Young Scavenger", id: 1508 },
	]);
	assert.deepEqual(refs("nothing here"), []);
});
