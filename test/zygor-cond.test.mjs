import { test } from "node:test";
import assert from "node:assert/strict";
import { translate, completeGoal, GUIDEFLAGS } from "../src/zygor/cond.mjs";
import { CLASSES, RACES } from "../src/cond.mjs";

const t = (s) => translate(s, {});

test("class names OR together", () => {
	assert.deepEqual(t("Warrior or Warlock").only, { class: ["Warrior", "Warlock"] });
	assert.deepEqual(t("Warrior,Rogue").only, { class: ["Warrior", "Rogue"] });
});

test("race and class juxtaposed are an AND, Zygor's race names are aliased", () => {
	assert.deepEqual(t("Scourge Warlock").only, { race: ["Undead"], class: ["Warlock"] });
	assert.deepEqual(t("Night Elf Druid").only, { race: ["NightElf"], class: ["Druid"] });
	assert.deepEqual(t("NightElf").only, { race: ["NightElf"] });
});

test("factions are a list of their own", () => {
	assert.deepEqual(t("Horde").only, { faction: ["Horde"] });
	assert.deepEqual(t("not Alliance").only, { faction: ["Horde"] });
});

test("not a race is the other races", () => {
	assert.deepEqual(t("not Undead").only, { race: RACES.filter((r) => r !== "Undead") });
	assert.deepEqual(t("not Warrior").only.class, CLASSES.filter((c) => c !== "Warrior"));
});

test("unknown races are dropped, not an only", () => {
	const r = t("BloodElf");
	assert.deepEqual(r.only, {});
	assert.deepEqual(r.dropped, ["BloodElf"]);
});

test("hardcore and selfmade are false", () => {
	assert.deepEqual(t("not hardcore()"), { only: {}, whens: [], never: false, dropped: [] });
	assert.equal(t("hardcore()").never, true);
	assert.equal(t("hardcore").never, true);
	assert.equal(t("selfmade()").never, true);
	const r = t("Druid and not selfmade()");
	assert.deepEqual(r.only, { class: ["Druid"] });
	assert.equal(r.never, false);
	assert.equal(t("Druid and hardcore()").never, true);
});

test("quest predicates", () => {
	assert.deepEqual(t("haveq(8538)").whens, ["onquest 8538"]);
	assert.deepEqual(t("haveq(1,2)").whens, ["onquest 1,2"]);
	assert.deepEqual(t("not haveq(5)").whens, ["!onquest 5"]);
	assert.deepEqual(t("completedq(7)").whens, ["turnedin 7"]);
	assert.deepEqual(t("completedq(7,8)").whens, ["turnedin 7", "turnedin 8"]);
	assert.deepEqual(t("readyq(9)").whens, ["available 9"]);
});

test("guide flags are dungeons", () => {
	assert.deepEqual(t('guideflag("Maraflag")').whens, ['dungeon "Maraudon"']);
	assert.equal(GUIDEFLAGS.ZFflag, "Zul'Farrak");
	assert.deepEqual(t('guideflag("Nope")').dropped, ["guideflag"]);
});

test("walking and indoors are assumed true and named", () => {
	const r = t('walking and not zone("Wetlands")');
	assert.deepEqual(r.whens, ['!zone "Wetlands"']);
	assert.deepEqual(r.dropped, ["walking"]);
	assert.equal(r.never, false);
});

test("not in front of a term without a form drops the whole term", () => {
	const r = t('not (subzone("X") and indoors())');
	assert.deepEqual(r.whens, []);
	assert.deepEqual(r.dropped, ["indoors"]);
	const b = t("not hasbuff('Foo')");
	assert.deepEqual(b.whens, []);
	assert.deepEqual(b.dropped, ["hasbuff"]);
});

test("itemcount, level, skill, zone", () => {
	assert.deepEqual(t("itemcount(21377) >= 5").whens, ["has 21377 x5"]);
	assert.deepEqual(t("itemcount(21377) > 4").whens, ["has 21377 x5"]);
	assert.deepEqual(t("itemcount(21377) >= 1").whens, ["has 21377"]);
	assert.deepEqual(t("itemcount(21377) == 0").whens, ["!has 21377"]);
	assert.deepEqual(t("itemcount(21377) < 1").whens, ["!has 21377"]);
	assert.deepEqual(t("not itemcount(21377) >= 5").whens, ["!has 21377 x5"]);
	assert.deepEqual(t("level >= 20").whens, ["level>=20"]);
	assert.deepEqual(t("not level >= 20").whens, ["level<20"]);
	assert.deepEqual(t("level < 12").whens, ["level<12"]);
	assert.deepEqual(t('skill("Mining") >= 50').whens, ["skill Mining 50"]);
	assert.deepEqual(t('skill("First Aid") >= 1').whens, ['skill "First Aid" 1']);
	assert.deepEqual(t('subzone ("Twilight Grove")').whens, ['subzone "Twilight Grove"']);
});

test("predicates without a Polestar form are dropped", () => {
	const r = t("Orc discountgold('Orgrimmar',1000000)");
	assert.deepEqual(r.only, { race: ["Orc"] });
	assert.deepEqual(r.dropped, ["discountgold"]);
	assert.deepEqual(t("rep('X') >= Friendly").dropped, ["rep"]);
	assert.deepEqual(t("ZGV.foo").dropped, ["ZGV.foo"]);
});

test("an OR of mixed kinds or predicates is dropped whole", () => {
	const r = t("haveq(5) or completedq(5)");
	assert.deepEqual(r.whens, []);
	assert.deepEqual(r.dropped, ["or"]);
	assert.deepEqual(t("Warrior or Orc").only, {});
});

test("completeGoal", () => {
	assert.deepEqual(completeGoal("rep('Timbermaw Hold') >= Friendly"), { kind: "rep", faction: "Timbermaw Hold", standing: "Friendly" });
	assert.deepEqual(completeGoal('hasprof("Mining",50)'), { kind: "skill", skill: "Mining", n: 50 });
	assert.deepEqual(completeGoal("skill('First Aid') >= 150"), { kind: "skill", skill: "First Aid", n: 150 });
	assert.deepEqual(completeGoal("_G.GetMoney() >= 350"), { kind: "money", copper: 350 });
	assert.deepEqual(completeGoal("itemcount(5) >= 3"), { kind: "collect", item: 5, count: 3 });
	assert.deepEqual(completeGoal("zone('Wetlands')"), { kind: "enter", place: "Wetlands" });
	assert.deepEqual(completeGoal("subzone('Menethil Harbor')"), { kind: "enter", place: "Menethil Harbor" });
	assert.equal(completeGoal("isdead"), null);
});

test("an OR of who-lists that differ in one kind is one list", () => {
	assert.deepEqual(t("(Orc Hunter) or (Troll Hunter)").only, { race: ["Orc", "Troll"], class: ["Hunter"] });
	assert.deepEqual(t("(Orc Hunter) or (Troll Mage)").dropped, ["or"]);
});

test("real-file oddities do not throw", () => {
	assert.doesNotThrow(() => t("not ZGV.Inventory:CharacterBankKnown()"));
	assert.doesNotThrow(() => t("hardcore{}"));
});
