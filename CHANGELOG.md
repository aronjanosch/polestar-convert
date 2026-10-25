# Changelog

## 0.2.1 (unreleased)

- **Convert only guides you have the right to use:** said in the README, by
  the command line, and confirmed with a tick on the web page before it
  converts.
- **Zygor's free trial guides** (the starting zones the viewer ships) are
  converted for a faction whose full leveling guides are not installed.
- RestedXP routes are `main`, `dungeon` and `survival`; the web page names
  them neutrally.
- **Zygor: every guide family.** Dungeon, profession, reputation and event
  guides and the end-game chains are converted beside the leveling guides,
  each in its Polestar category and folder (733 guides instead of 100).
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
