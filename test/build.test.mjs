// How the build keeps going when Polestar's compiler refuses some guides.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compileKeeping } from "../src/build.mjs";

// A compiler that refuses the guides whose text says "bad", and those that say "needs <slug>"
// while that guide is not compiled with them.
const fakeCompiler = () => ({
	calls: 0,
	compile(json) {
		this.calls++;
		const files = JSON.parse(json);
		const have = new Set(files.map(([p]) => p));
		const diags = [];
		for (const [p, text] of files) {
			if (text.includes("bad")) diags.push({ file: p, line: 1, severity: "error", message: "bad line" });
			const next = text.match(/^next (.+)$/m);
			for (const id of next ? next[1].split(/,\s*/) : []) if (!have.has(`guides/${id.split("/")[1]}.guide`)) diags.push({ file: p, line: 1, severity: "error", message: `next points to unknown guide` });
			const need = text.match(/needs (\S+)/);
			if (need && !have.has(`guides/${need[1]}.guide`)) diags.push({ file: p, line: 2, severity: "error", message: `needs ${need[1]}` });
			diags.push({ file: p, line: 3, severity: "warning", message: "a warning" });
		}
		return JSON.stringify(diags);
	},
});

test("guides the compiler refuses are left out, the rest compiles", () => {
	const c = fakeCompiler();
	const r = compileKeeping(c, [["guides/a.guide", "fine"], ["guides/b.guide", "bad"], ["guides/c.guide", "fine"]]);
	assert.deepEqual(r.kept.map(([p]) => p), ["guides/a.guide", "guides/c.guide"]);
	assert.deepEqual(r.dropped.map((d) => d.file), ["guides/b.guide"]);
	assert.equal(r.dropped[0].errors[0].message, "bad line");
	assert.equal(r.errors.length, 0);
	assert.equal(r.warnings, 2);
});

test("a guide that fails only without a dropped one is left out in the next round", () => {
	const c = fakeCompiler();
	const r = compileKeeping(c, [["guides/a.guide", "bad"], ["guides/b.guide", "needs a"], ["guides/c.guide", "fine"]]);
	assert.deepEqual(r.kept.map(([p]) => p), ["guides/c.guide"]);
	assert.deepEqual(r.dropped.map((d) => d.file), ["guides/a.guide", "guides/b.guide"]);
	assert.equal(r.dropped[1].errors[0].message, "needs a");
});

test("an error no guide carries stops the build", () => {
	const c = { compile: () => JSON.stringify([{ file: "pack.json", severity: "error", message: "pack" }]) };
	const r = compileKeeping(c, [["guides/a.guide", "fine"]]);
	assert.equal(r.errors.length, 1);
});

test("a next to a guide left out goes, the guide before it stays", () => {
	const c = fakeCompiler();
	const r = compileKeeping(c, [["guides/a.guide", "guide p/a\nnext p/b\nfine"], ["guides/b.guide", "bad"]]);
	assert.deepEqual(r.kept.map(([p]) => p), ["guides/a.guide"]);
	assert.doesNotMatch(r.kept[0][1], /^next/m);
	assert.match(r.kept[0][1], /^guide p\/a$/m);
	assert.deepEqual(r.dropped.map((d) => d.file), ["guides/b.guide"]);
});

test("of a next with several guides only the ones left out go", () => {
	const c = fakeCompiler();
	const r = compileKeeping(c, [["guides/a.guide", "guide p/a\nnext p/b, p/c\nfine"], ["guides/b.guide", "fine"], ["guides/c.guide", "bad"]]);
	assert.deepEqual(r.kept.map(([p]) => p), ["guides/a.guide", "guides/b.guide"]);
	assert.match(r.kept[0][1], /^next p\/b$/m);
	assert.deepEqual(r.dropped.map((d) => d.file), ["guides/c.guide"]);
});

test("a next whose guides are all left out goes", () => {
	const c = fakeCompiler();
	const r = compileKeeping(c, [["guides/a.guide", "guide p/a\nnext p/b, p/c\nfine"], ["guides/b.guide", "bad"], ["guides/c.guide", "bad"]]);
	assert.deepEqual(r.kept.map(([p]) => p), ["guides/a.guide"]);
	assert.doesNotMatch(r.kept[0][1], /^next/m);
});
