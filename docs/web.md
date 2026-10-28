# The browser page

https://aronjanosch.github.io/polestar-convert/ converts the guide addons of a
folder the player picks and hands the pack over as a ZIP. It runs the same
converter as the command line (`src/core.mjs`); for the same addons and data
the ZIP's guides equal what `polestar-convert --path` writes.

## How it works

- `web/index.html` and `web/app.mjs`: the player picks a folder
  (`<input webkitdirectory>`). `addonsPaths` finds the files under
  `Interface/AddOns` (the World of Warcraft folder, a client folder, the AddOns
  folder or one addon's folder all work; of several clients `_forever_` comes
  first). Only the files under `RXPGuides/Guides/`, `Journey/data/Guides/` and
  `ZygorGuidesViewerClassic/Guides-Classic/{Leveling,Dungeons,Professions,Reputations,Events}/`
  are passed on.
- `web/worker.mjs` reads those files in the browser, fetches the game data from
  `polestar-data/`, runs `convertAddons`, then Polestar's compiler (`wasm/`, built
  into `web/forge/`: `Compiler` compiles the guides into addon folders, `packFiles`
  writes them). With a language picked, `rxpTranslations` fills RestedXP's
  translated texts in first. Errors from the compiler stop the ZIP; warnings do not.
  The page's Content-Security-Policy allows connections to its own site only.
- The ZIP holds the addon folders (`<pack id>/` with the guides, and sibling
  addons such as the names packs beside it), ready to unzip into
  `Interface/AddOns`. Polestar itself must be in that folder. Where
  `showDirectoryPicker` exists, the page can also write the folders there.
- `tools/pages.mjs` builds the compiler (cargo, wasm-bindgen via mise) and the
  client tables (`wasm/`'s `tables` binary) from the clone.
- Not in the page: `--only`, `--max-start`, `--self-found`, Journey's `--ah`
  and `--groups`.

## The game data

`polestar-data/` is a copy of the files the converter reads from a Polestar
clone (`dataFiles` in `src/data.mjs`): `data/forever` (quests, NPCs, objects,
items, zones, map frames, races, codex journal, travel, professions) and the
client tables AreaTable, SpellName (Forever build) and WMOAreaTable (Era
build), about 34 MiB, 4 MiB gzipped. `manifest.json` names the Polestar commit,
the builds, whether QuestieDB went in, and Polestar's XP table.

It is published under **GPLv3** with `LICENSE` and `NOTICE.md` (sources from
the data build's `meta.json`, rebuild steps), because it holds QuestieDB
facts: since 2026-10-21 Questie and QuestieDB carry a licence naming GPLv3 as
their target licence, and their maintainers are fine with copying under GPLv3;
they cannot confirm it for every past contributor (issue #1). The converter's
code stays MIT.

**Fallback without QuestieDB**, if QuestieDB's licence does not allow it: build the
data in a clone with `node tools/polestar.js data build --no-questie` (then
`travel build`, `profession build`, `codex build`) and publish from that clone.
The page then shows a warning. Measured on 2026-10-23 against Polestar
772b2065 (`tools/compare.mjs` with `--polestar-after`): without QuestieDB 975
Forever-only quests are missing, RestedXP changes 267 of 272 guides with 38
lint errors (class trainers for Forever's new race and class pairs), Journey 33
of 38 with 4 errors, Zygor 91 of 101 with none. So it is an emergency mode, not
an equal.

## Building and publishing

```sh
node tools/pages.mjs --polestar <clone>          # writes out/pages
cd out/pages && python3 -m http.server 8765      # try it at http://127.0.0.1:8765/
```

The clone needs `data build --no-web-xp --no-wowhead` (values taken from
web pages stay local, as in Polestar's own releases), then `travel build`,
`profession build` and `codex build`. Converted guides are the same as with a
full local build (checked 2026-10-23: 0 guides changed for all three sources). Publishing puts `out/pages` on the `gh-pages` branch as one
commit (the data stays out of `main`'s history):

```sh
cd out/pages
git init -q -b gh-pages && git add -A && git commit -qm "Pages: Polestar <commit>"
git push -f https://github.com/aronjanosch/polestar-convert gh-pages
```

GitHub Pages serves the `gh-pages` branch (repository settings, Pages, branch
`gh-pages`, folder `/`). Rebuild and publish when Polestar's data changes.
