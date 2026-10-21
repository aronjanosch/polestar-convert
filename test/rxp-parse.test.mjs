import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGuide } from "../src/rxp/parse.mjs";

const lines = (body) => parseGuide("step\n" + body).steps[0].lines;

test("a comment is cut before the condition is read", () => {
	const [l] = lines(".goto 1,2,3 << skip --logout skip << Warrior");
	assert.equal(l.cond, "skip");
	const [m] = lines(".accept 5 >> Accept X --note << Mage");
	assert.equal(m.cond, null);
	assert.equal(m.comment, "note << Mage");
});

test("a goto comment does not leak into the arguments", () => {
	const [l] = lines(".goto Mulgore,44.29,60.1--c:Mulgore,44.29,60.1");
	assert.equal(l.args, "Mulgore,44.29,60.1");
});

test("`<<` needs no space and cuts at the first one", () => {
	const [n] = lines("+Kill them<<Warrior/Rogue");
	assert.equal(n.text, "Kill them");
	assert.equal(n.cond, "Warrior/Rogue");
});
