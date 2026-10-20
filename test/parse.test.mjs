import { test } from "node:test";
import assert from "node:assert/strict";
import { extractGuides, parseGuide, parseName, plain } from "../src/rxp/parse.mjs";

// An invented guide in RXP's syntax; no real guide text lives in this repo.
const LUA = `RXPGuides.RegisterGuide([[
#name 1-6 Testville
#next 6-9 Testville
<< Horde
step << Warrior/Priest
    .goto 1/0,100.5,200.25,8
    >>Talk to |cRXP_FRIENDLY_Bob|r
    .accept 1 >> Accept A Thing << Priest
    .target Bob
step
    #completewith next
    +|cRXP_WARN_Be careful|r
]])`;

test("extracts a guide body", () => {
	assert.equal(extractGuides(LUA).length, 1);
});

test("parses header, steps, lines and conditions", () => {
	const g = parseGuide(extractGuides(LUA)[0]);
	assert.equal(g.header.name, "1-6 Testville");
	assert.equal(g.header.faction, "Horde");
	assert.equal(g.steps.length, 2);
	assert.equal(g.steps[0].cond, "Warrior/Priest");
	const accept = g.steps[0].lines.find((l) => l.name === "accept");
	assert.equal(accept.args, "1");
	assert.equal(accept.cond, "Priest");
	assert.equal(accept.text, "Accept A Thing");
	assert.equal(g.steps[1].tags[0].name, "completewith");
});

test("names and markup", () => {
	assert.deepEqual(parseName("12-14 Silverpine Forest"), { levels: "12-14", zone: "Silverpine Forest" });
	assert.equal(plain("|cRXP_WARN_Be careful|r |T123:0|t[Item]"), "Be careful [Item]");
});
