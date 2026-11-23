# Changelog

## Unreleased

For Polestar 0.4.1: the page's compiler and data are Polestar 0.4.1's.

- **RestedXP: dungeon and text-only steps stay in the guide**: an ordinary
  step with instructions (`>>` text and no `.goto`, such as boss and route
  steps inside a dungeon) was dropped before, and a `+`-note-only step had no
  goal to hold it; both now become `task` steps to tick (with the `.goto` spot
  when `+` notes have one). On an ordinary step, text written on a `.goto` or
  an ignored `.subzone`/`.zone` line (such as dungeon entrances with
  `.subzone <id>,2`) is kept instead of leaving an untitled `Step N` waypoint.
- **Polestar 0.4.1**: the page's compiler and game data move to 0.4.1, built
  with QuestieDB 1.1.2. Its data names the quest targets the game only knows by
  a placeholder ("Credit", "… (DND)") by their quest-log line, so the
  Teldrassil Lunar Pendant and Felwood moonwell steps compile again, and with
  them the guides after them. Checked with RestedXP 4.11.36 and Zygor
  1.6.37640: every guide is kept (526 RestedXP, 753 Zygor).
- **RestedXP's Skyborne guides**: RXP 4.11.36 runs `Forever` into 96 step
  and comment lines of `RestedXP-Skyborne.lua` (`Foreverstep << Horde
  Shaman`); they are read as the steps they are meant to be, so Zephras Isle
  converts and the Horde route after it is no longer left out. The report
  counts them.
- **RestedXP:** a `.goto` world point off its own map (RXP gives the same
  place on the next map beside it) is left out instead of written below 0%;
  Swamp of Sorrows 38-39 and the Alliance route after it are kept.
- **RestedXP: Polestar 0.4.1's goals** (pack format 11):
  - `.aura` with text is a `buff` goal (a negative id: `buff … off`), named
    by the client's spell table (the line's `[Name]` may be the item that
    gives the aura); without text the step is skipped while the aura is on
    (`when !buff`, or `when buff` for a negative id).
  - `.reputation` is a `rep` goal (`Neutral+1500` for points into a standing),
    or with its skip flag a `when rep` / `when !rep` condition.
  - `.gossipoption` is a `talk` to the step's target that picks that gossip
    option (`gossip`).
  - `.dailyturnin` of one quest is `turnin … direct`, shown while the bags hold
    the quest's items when the step does nothing else.
- **Bag counts without a source nearby** (RestedXP and Zygor): a `collect`
  of an item to save up or buy (cloth, materials) with no place of its own and
  no source on the step's map is `collect … anywhere`: Polestar counts it
  without sending the arrow to a dropper on another continent. 354 map
  warnings and 746 "no coordinates" warnings fewer.
- **Zephras Isle's points**: RestedXP's zone points on a map Era never had are
  Forever's own (`era` dropped); 252 warnings fewer.
- **RestedXP: reminders, tools and hearths that check off** (#26): Polestar
  checks a `task` in an `along` step only on the step the route is on, so it
  never checked off. A `#completewith` reminder ("Be careful of the guards")
  is now a note in the next step; one under a `when` (a level, an item, a
  dungeon) a step of its own to tick. A `.use` beside the quest objective it
  serves is bound to it (`use <item> quest Q.O`) and is done with it. A
  hearth's place is read without RXP's words after it ("Gadgetzan. Buy
  drink"), by the start of an inn's name ("Theramore", "Menethil"), and a
  starting area, where no inn stands, is `enter` that area. Against RestedXP
  4.11.36: 928 `along` task warnings to none, 174 `along` use warnings to 62,
  81 hearth warnings to none; every guide kept.
- **Dungeon and group steps lead the way**: in a step only the players who
  chose a dungeon or a group see (`when dungeon`, `when group`), optional
  goals (elites, the way there) hold, so the step shows its arrow instead of
  being passed at once; a turn-in stays optional. RestedXP: 191 such steps.
- **A choice of next guides keeps the ones left**: when the compiler leaves
  out one guide of `next a, b`, only that one goes from the line; before, the
  line stayed and the guide before it was left out too.
- **Zygor:** a `kill … |q Q/n` whose quest's objective is an event (an escort)
  counts the whole quest (`complete Q`), not a kill of no one.
- **NPCs without a name** in the quest data (QuestieDB lists a few) no longer
  stop the converter.
- **Polestar 0.3.7**: the page's compiler moves to 0.3.7; its client tables
  give each spell name its class mask, so a class guide's texts name its own
  spells.
- **RestedXP on Forever is phase 5**: RestedXP now reads Forever as the phase
  before Naxxramas, so steps tagged `#phase 6` are left out and steps tagged
  up to phase 5 are kept, as RestedXP shows them.
- **Polestar 0.3.5**: the page's compiler and game data move from 0.3.1 to
  0.3.5. Its quest data lists speaking with someone as a `talk` objective;
  RestedXP's `.complete`, Zygor's `talk … |q Q/n` and objective text lines and
  Journey's objectives now write `talk <npc> quest Q.O` for it, which Polestar
  checks off as that quest-log line. Such a talk stays in a step that also
  accepts or hands in a quest.
- **Putting the addon into the game**: README (EN, zhCN) and the page say to
  copy or move the pack's folders as they are into `Interface/AddOns`.
- **Where the guide files must be**: README (EN, zhCN) and the page say which
  folder and file each source's guides are read from, as plain text; picking a
  single file says so.
- **The pack carries its sources' version**: the `## Version:` of the guide
  addon's TOC (one source as it is, several as `rxp1.2.3+zygor1.6`), where it
  was `0.1.0` before.
- **`--install` replaces the addon a race loads too**: the compiler's per-race
  folders (`X-Polestar-Part`) count as the pack's own, and every folder is
  checked before any is removed, so a refusal leaves the old addon whole.
- **Zygor's Forever viewer** (`ZygorGuidesViewerForever/Guides-Forever/`) is
  found by `--path`, the page and `zygor --dir`; the older Classic viewer's
  folder still works. Guides of its faction-free `Common` files are converted
  without a faction.
- **Zygor:** `|gossip` picks the NPC's gossip option (`gossip`), a known spell
  or recipe is `when knows`, and a spell to learn in `|complete` is `learn`.
  A quest goal on a step for other races than the quest's is left out.
- **RestedXP:** `.timer` is a countdown in the step (`wait`).
- **A guide Polestar's compiler refuses is left out**, named with its errors
  (`reports/left-out.txt` on the command line, a note on the page), and the
  addon is made from the rest. A `next` to a guide left out is dropped, so the
  guides before it stay; guides after it that need its quests are left out too.
- **RestedXP:** guides RXP does not list on Forever (another season, XP rate
  or phase, SoM, a header `<<` nobody meets) are not converted. `.xp L+N` past
  Polestar's XP for the level is the next level; an endgame guide without
  quests that tell its levels is for level 60; in a guide for both sides, a
  quest the data closes to a step's side is left out of that step.
- **RestedXP:** `.use` beside a goal that ends the step is an optional `use`:
  the step ends with its objective, accept or hearth, not with a tick, and the
  item button stays. Before, such steps waited for the player to tick them.

## 0.3.0 (unreleased)

Nothing to bring but your guides: no Polestar clone, no game data to build.

- **A finished addon, from the page or one command.** Polestar's own compiler
  (`forge-guide`, as WebAssembly, `wasm/`) builds the converted guides into the
  addon folders: unzip the page's ZIP into `Interface/AddOns`, or run
  `npx github:aronjanosch/polestar-convert --path <WoW> --install`. Chrome and
  Edge can put the folders there from the page itself.
- **RestedXP's translations on the page too**, as a language addon beside the
  guides (`<addon>_zhCN`); the command line adds every language RestedXP ships.
- **The command line reads the page's data and compiler** (kept in a cache):
  its `--polestar` and `--pack` are gone, `--name`, `--out` and `--install`
  remain. The single commands (`rxp`, `journey`, `zygor`) still write `.guide`
  files into a pack, for working on the converter with Polestar's tools; `rxp`
  no longer translates.
- A converted pack's licence says what it is: "Personal use: converted from
  guides you own".
- **Convert only guides you have the right to use:** said in the README, by
  the command line, and confirmed with a tick on the web page before it
  converts.
- **Zygor's free trial guides** (the starting zones the viewer ships) are
  converted for a faction whose full leveling guides are not installed.
- RestedXP routes are `main`, `dungeon` and `survival`; the web page names
  them neutrally.
- **Zygor: every guide family.** Dungeon, profession, reputation and event
  guides and the end-game chains are converted beside the leveling guides,
  each in its Polestar category and folder.
- **Zygor: more of each step carries over.** `walking`, `indoors` beside a
  subzone, `discountgold`, `completedallq` and ORs of conditions (a copy of
  the step per alternative); a way line for some places is a `goto` step of
  its own; goal lines under different conditions are a step each; `|or` with
  a skill check is `when !skill`; menus are a step per option; jumps without
  a condition use `when done`; professions train their rank, learn at the
  trainer (one per race), reach their skill and gather along `loop` routes;
  dungeons are entered with `enter`; `abandon`, `cast`, `use` and standings.
- **Zygor: `'` lines** are goals of their own, as in Zygor's parser, not
  continuations of the line above; jumps on a check Polestar cannot ask are
  dropped instead of taken.
- **Translations reach much further, Chinese first.** A line a guide's own
  translation lacks comes from any other guide RXP translated it in (also
  for guide files RXP ships no translated copy of); a text that pairs with
  nothing takes the translation of a text of the same shape (names, plurals
  and lists of names as placeholders), line by line and sentence by
  sentence; the converter's own sentences come in Chinese. The report
  counts texts filled only in part.
- **A translated guide is converted by its English words** (inn, vendor,
  trainer, level goal), so its texts line up with the English ones; a step
  title shortened in one language only still pairs; a name RXP's translator
  spelled their own way is found by its brackets or one character off.

## 0.2.0 (2026-10-23)

No clone of the converter any more: one command, or a page in the browser.

- **`npx github:aronjanosch/polestar-convert --path <WoW>`** finds RestedXP, Journey and Zygor in
  the client's `Interface/AddOns`, makes the pack, converts every guide (with
  RestedXP's translations), lints and, with `--install`, installs it.
- **RestedXP routes:** `--routes` (asked when unset) keeps the routes you
  play; the dungeon route takes the dungeon quest guides with it.
- **Browser page** at https://aronjanosch.github.io/polestar-convert/: pick the
  AddOns folder, tick the routes, download the pack as a ZIP. The guide files
  are read in the browser and never uploaded; the page loads Polestar's game
  data from the site, published under GPLv3 (it holds QuestieDB facts).
- **One core for both:** the converter reads its inputs through a `read`
  function instead of the disk. The output for the same input is unchanged
  from 0.1.0.
- `tools/compare.mjs` compares Journey and Zygor runs too, and two data builds
  (`--polestar-after`).
- A pack made by `--path` leaves out the template's `example.guide`: Polestar's
  `i18n guides sync` fails on its hand-off to a Polestar guide, which stopped
  the translations in a fresh pack.

## 0.1.0 (2026-10-23)

The first release, for players on Polestar's `next` branch (Polestar 0.3.0,
guide pack format 5).

- **Three sources into one pack:** RestedXP (every guide of
  `GuideList-forever.xml`, chained by `#next`, with RestedXP's German, Spanish,
  French, Brazilian Portuguese and Chinese texts), Journey (the install's
  catalog, chained by its "next guide" buttons) and Zygor (the Classic leveling
  guides of both factions and the class quest guides).
- **Polestar 0.3.0's goals and conditions:** `abandon`, `destroy`, `cast`,
  `enter`, `task`, `money`; `when group`, `when skill`, `when cooldown`,
  `when money`, `when done`, `when subzone`; `skipto`.
- **Steps beside the route** (RestedXP's `#completewith`, Zygor's sticky steps)
  go to *Along the way* where Polestar can tick them, else a step or task of
  their own.
- **Places by id:** RestedXP's subzones by AreaTable id become `enter` goals and
  `when subzone` conditions.
- **Every run reports** what it dropped, softened or could not place; Journey
  and Zygor also write a gap report into the pack.

Known gaps are listed in the README and per source in `docs/`.
