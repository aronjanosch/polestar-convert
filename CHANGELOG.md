# Changelog

## 0.2.1 (unreleased)

- **Convert only guides you have the right to use:** said in the README, by
  the command line, and confirmed with a tick on the web page before it
  converts.
- RestedXP routes are `main`, `dungeon` and `survival` (the 0.2.0 names still
  work); the web page names them neutrally.

## 0.2.0 (2026-10-23)

No clone of the converter any more: one command, or a page in the browser.

- **`npx polestar-convert --path <WoW>`** finds RestedXP, Journey and Zygor in
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
