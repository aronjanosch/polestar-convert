#!/usr/bin/env node
// Converts the same guides with two versions of the converter and shows what changed:
// line kinds, the converter's own counts and lint findings before -> after, and
// the guides whose text changed. The check for any converter fix.
//
// Usage: node tools/compare.mjs <base ref> [--head <ref>]
//          (--list <GuideList-forever.xml> | --file <guide.lua> | --journey <Journey dir> | --zygor <Zygor dir>)
//          [--polestar <clone>] [--polestar-after <clone>] [--out <dir>] [--lint no]
// <base ref> and --head are git refs of this repo; without --head the working tree
// (uncommitted changes included) is the "after". --polestar-after converts the
// "after" side against another clone's data (the same ref twice then compares two
// data builds). Writes into --out (default: a new temp dir): before/ and after/
// packs, their run reports, lint output and diff.patch.

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

function args(argv) {
	const out = { _: [] };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i].startsWith("--")) out[argv[i].slice(2)] = argv[++i];
		else out._.push(argv[i]);
	}
	return out;
}

const a = args(process.argv.slice(2));
const [base] = a._;
if (!base || !(a.list || a.file || a.journey || a.zygor)) {
	console.error("usage: node tools/compare.mjs <base ref> [--head <ref>] (--list <GuideList-forever.xml> | --file <guide.lua> | --journey <Journey dir> | --zygor <Zygor dir>) [--polestar <clone>] [--polestar-after <clone>] [--out <dir>] [--lint no]");
	process.exit(2);
}
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const polestar = resolve(a.polestar || process.env.POLESTAR || join(process.env.HOME, "Work/polestar-next"));
const polestarAfter = a["polestar-after"] ? resolve(a["polestar-after"]) : polestar;
const out = resolve(a.out || mkdtempSync(join(tmpdir(), "polestar-compare-")));
mkdirSync(out, { recursive: true });
const source = a.journey ? ["journey", "--dir", resolve(a.journey)]
	: a.zygor ? ["zygor", "--dir", resolve(a.zygor)]
	: ["rxp", ...(a.list ? ["--list", resolve(a.list)] : ["--file", resolve(a.file)]), "--locales", "none"];

function run(cmd, argv, opt = {}) {
	const r = spawnSync(cmd, argv, { encoding: "utf8", maxBuffer: 1 << 30, ...opt });
	if (r.error) throw r.error;
	return r;
}
function git(...argv) {
	const r = run("git", ["-C", repo, ...argv]);
	if (r.status) throw new Error(`git ${argv.join(" ")}: ${r.stderr.trim()}`);
	return r.stdout.trim();
}

// A ref gets a throwaway worktree; no ref is this tree as it stands.
const trees = [];
function checkout(name, ref) {
	if (!ref) return repo;
	const dir = join(out, `src-${name}`);
	git("worktree", "add", "--detach", "--force", dir, ref);
	trees.push(dir);
	return dir;
}

// One pack per side. Translations are left out: they are slow and only repeat the
// English steps' changes.
function build(name, ref, clone) {
	const tree = checkout(name, ref);
	const pack = join(out, name);
	if (!existsSync(join(pack, "pack.json"))) {
		const r = run("node", [join(polestar, "tools/polestar.js"), "new", pack, "--id", "cmp", "--yes"]);
		if (r.status) throw new Error(`polestar new: ${r.stderr.trim()}`);
	}
	const r = run("node", [join(tree, "bin/polestar-convert.mjs"), ...source, "--polestar", clone, "--pack", pack]);
	writeFileSync(join(out, `${name}.report.txt`), r.stdout + r.stderr);
	if (r.status) throw new Error(`convert (${name}) failed, see ${join(out, `${name}.report.txt`)}`);
	const lint = a.lint === "no" ? null : run("node", [join(clone, "tools/polestar.js"), "lint"], { cwd: pack });
	if (lint) writeFileSync(join(out, `${name}.lint.txt`), lint.stdout + lint.stderr);
	return { pack, report: r.stdout, lint: lint && lint.stdout + lint.stderr };
}

// What the guides are made of: the first word of every line, `along until` apart
// from a bare `along`, and the `optional` marks.
function kinds(pack) {
	const c = new Map();
	const add = (k) => c.set(k, (c.get(k) || 0) + 1);
	const dir = join(pack, "guides");
	for (const f of readdirSync(dir).filter((f) => f.endsWith(".guide"))) {
		for (const line of readFileSync(join(dir, f), "utf8").split("\n")) {
			const t = line.trim();
			if (!t || t.startsWith("#")) continue;
			const w = t.split(/\s+/);
			add(w[0] === "along" && w[1] === "until" ? "along until" : w[0]);
			if (/\boptional\b/.test(t) && w[0] !== "step") add("(optional)");
		}
		add("(guides)");
	}
	return c;
}

// The converter's "== counts" section.
function counts(report) {
	const c = new Map();
	const at = report.indexOf("== counts");
	if (at < 0) return c;
	for (const line of report.slice(at).split("\n").slice(1)) {
		const m = /^\s*(\d+) (.+)$/.exec(line);
		if (!m) break;
		c.set(m[2], (c.get(m[2]) || 0) + Number(m[1]));
	}
	return c;
}

// Lint findings by kind: ids, names and numbers taken out, so one message counts once.
function findings(lint) {
	const c = new Map();
	if (!lint) return c;
	for (const line of lint.split("\n")) {
		const m = /: (error|warning): (.*)$/.exec(line);
		if (!m) continue;
		const k = `${m[1]}: ${m[2].replace(/`[^`]*`/g, "`…`").replace(/"[^"]*"/g, '"…"').replace(/\([^)]*\)/g, "(…)").replace(/\d+(\.\d+)?/g, "N")}`;
		c.set(k, (c.get(k) || 0) + 1);
	}
	const total = /(\d+) errors?, (\d+) warnings?/.exec(lint);
	if (total) { c.set("(errors)", Number(total[1])); c.set("(warnings)", Number(total[2])); }
	return c;
}

function table(title, before, after, width = 90) {
	const keys = [...new Set([...before.keys(), ...after.keys()])]
		.map((k) => ({ k, b: before.get(k) || 0, a: after.get(k) || 0 }))
		.filter((r) => r.b !== r.a)
		.sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b));
	console.log(`\n== ${title}${keys.length ? "" : ": no change"}`);
	for (const r of keys) {
		const d = r.a - r.b;
		console.log(`${String(r.b).padStart(7)} -> ${String(r.a).padEnd(7)} ${(d > 0 ? "+" : "") + d}`.padEnd(26) + r.k.slice(0, width));
	}
}

try {
	const before = build("before", base, polestar);
	const after = build("after", a.head, polestarAfter);

	// Per guide: lines added and removed, and the whole diff to read by hunk.
	const diffArgs = ["diff", "--no-index", "--no-color"];
	const bg = join(before.pack, "guides"), ag = join(after.pack, "guides");
	writeFileSync(join(out, "diff.patch"), run("git", [...diffArgs, bg, ag]).stdout);
	const changed = run("git", [...diffArgs, "--numstat", bg, ag]).stdout.trim().split("\n").filter(Boolean)
		.map((l) => l.split("\t")).map(([add, del, p]) => ({ add: Number(add), del: Number(del), slug: p.replace(/.*\//, "").replace(/\.guide\W*$/, "") }))
		.sort((x, y) => y.add + y.del - (x.add + x.del));

	table("line kinds (whole pack)", kinds(before.pack), kinds(after.pack));
	table("converter counts", counts(before.report), counts(after.report));
	if (before.lint) table("lint", findings(before.lint), findings(after.lint));
	console.log(`\n== guides changed: ${changed.length}`);
	for (const c of changed.slice(0, 40)) console.log(`${`+${c.add} -${c.del}`.padEnd(14)}${c.slug}`);
	if (changed.length > 40) console.log(`... and ${changed.length - 40} more`);
	console.log(`\nout: ${out} (diff.patch, before/, after/, *.report.txt, *.lint.txt)`);
} finally {
	for (const t of trees) run("git", ["-C", repo, "worktree", "remove", "--force", t]);
}
