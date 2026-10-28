# The browser page

https://aronjanosch.github.io/polestar-convert/ converts the guide addons of a
folder the player picks and hands over the finished addon folders as a ZIP. It
runs the same code as the command line (`src/build.mjs`): for the same addons
and data, the ZIP holds what `polestar-convert --path` writes, byte for byte.
The command line takes the game data and the compiler from this site too.

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
- The ZIP holds the addon folders (`PolestarPack_<Name>/` with the guides, and sibling
  addons such as the language addon `<folder>_zhCN` beside it), ready to unzip into
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
data with `forge data build --no-questie` (then `forge data travel`,
`professions` and `codex`, as below) and publish from that checkout.
The page then shows a warning. Measured on 2026-10-23 against Polestar
772b2065 (`tools/compare.mjs` with `--polestar-after`): without QuestieDB the
Forever-only quests are missing, RestedXP changes N of N guides with N
lint errors (class trainers for Forever's new race and class pairs), Journey N
of N with N errors, Zygor N of N with none. So it is an emergency mode, not
an equal.

## Building and publishing

The page's compiler is pinned to one Polestar commit (`wasm/Cargo.toml`); build
the data in a checkout of that commit, without values taken from web pages (they
stay local, as in Polestar's own releases), with Polestar's `forge` (`cargo build
--release -p forge` in its `rust/`; Rust, and mise for wasm-bindgen, also build
the page's compiler):

```sh
git -C <clone> worktree add --detach <checkout> <pinned commit>
ln -s <clone>/data/sources <checkout>/data/sources      # the source cache
forge data build --root <checkout> --offline --no-web-xp --no-web-zones --questie "<WoW>/_forever_/Interface/AddOns"
forge data travel --root <checkout>; forge data professions --root <checkout>; forge data codex --root <checkout>
node tools/pages.mjs --polestar <checkout>       # writes out/pages
cd out/pages && python3 -m http.server 8765      # try it at http://127.0.0.1:8765/
```

`sources.json` in the built page must name no web source. Publishing puts
`out/pages` on the `gh-pages` branch as one commit (the data stays out of
`main`'s history):

```sh
cd out/pages
git init -q -b gh-pages && git add -A && git commit -qm "Pages: Polestar <commit>"
git push -f https://github.com/aronjanosch/polestar-convert gh-pages
```

GitHub Pages serves the `gh-pages` branch (repository settings, Pages, branch
`gh-pages`, folder `/`). Rebuild and publish when the pinned commit moves. The
command line reads the published page, so publish the page before a release
that needs it.
