// `polestar-convert --path`: finding the AddOns folder and reading the list options.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { addonsDirOf, listArg } from "../src/node/path-cli.mjs";

function tree(paths) {
	const root = mkdtempSync(join(tmpdir(), "pc-path-"));
	for (const p of paths) {
		mkdirSync(join(root, p, ".."), { recursive: true });
		if (p.endsWith("/")) mkdirSync(join(root, p), { recursive: true });
		else writeFileSync(join(root, p), "x");
	}
	return root;
}

test("addonsDirOf: the AddOns folder, the client folder or the World of Warcraft folder", () => {
	const root = tree(["World of Warcraft/_classic_era_/Interface/AddOns/Questie/", "World of Warcraft/_forever_/Interface/AddOns/RXPGuides/"]);
	const addons = join(root, "World of Warcraft/_forever_/Interface/AddOns");
	assert.equal(addonsDirOf(addons), addons);
	assert.equal(addonsDirOf(join(root, "World of Warcraft/_forever_")), addons);
	assert.equal(addonsDirOf(join(root, "World of Warcraft")), addons);
	assert.equal(addonsDirOf(join(root, "nowhere")), null);
});

test("addonsDirOf: of several clients with guide addons, _forever_ first, then _classic_beta_", () => {
	const root = tree(["WoW/_classic_beta_/Interface/AddOns/Journey/", "WoW/_forever_/Interface/AddOns/ZygorGuidesViewerClassic/"]);
	assert.equal(addonsDirOf(join(root, "WoW")), join(root, "WoW/_forever_/Interface/AddOns"));
	const beta = tree(["WoW/_classic_beta_/Interface/AddOns/Journey/", "WoW/_classic_/Interface/AddOns/Other/"]);
	assert.equal(addonsDirOf(join(beta, "WoW")), join(beta, "WoW/_classic_beta_/Interface/AddOns"));
});

test("listArg: a comma list of known names; unknown ones are an error", () => {
	const ROUTES = ["main", "dungeon", "survival"];
	assert.deepEqual(listArg("main, Survival", ROUTES, "--routes"), ["main", "survival"]);
	assert.equal(listArg(undefined, ROUTES, "--routes"), null);
	assert.deepEqual(listArg("all", ROUTES, "--routes"), ROUTES);
	assert.throws(() => listArg("main,other", ROUTES, "--routes"), /--routes: unknown "other" \(main, dungeon, survival\)/);
});
