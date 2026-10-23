# Development

Node 24+, no dependencies.

```sh
npm test
```

## Layout

```
bin/polestar-convert.mjs  the command: --path or one adapter, writes the pack
src/core.mjs         every guide addon of an AddOns folder in one run, pack files, the ZIP
src/rxp/run.mjs, src/journey/run.mjs, src/zygor/run.mjs
                     one source's whole run: file texts in, .guide texts out
src/node/            Node only: reading folders, --path, RXP's translations
src/zip.mjs, src/pack.mjs  the ZIP writer and a new pack's own files (web page)
web/                 the browser page; tools/pages.mjs builds it with the data (docs/web.md)
src/ir.mjs           the intermediate form and goal text; no source format in it
src/emit.mjs         intermediate guide -> Polestar .guide text
src/data.mjs         Polestar's reference data (ids, names, coordinates)
src/objective.mjs    a source's quest objective matched to Polestar's (RXP, Zygor)
src/rxp/parse.mjs    RXP Lua -> steps and lines
src/rxp/convert.mjs  RXP adapter: steps -> intermediate guide
src/rxp/chain.mjs    RXP's #next and #include across guides
src/journey/         Journey adapter: decode slots, Lua tables, conditions, steps
src/zygor/parse.mjs  Zygor Lua -> guides, steps and lines (no Lua is evaluated)
src/zygor/cond.mjs   `|only` / `|complete` expressions -> only, when, goals
src/zygor/convert.mjs  Zygor steps -> intermediate guide: sticky copies, jumps, labels
src/*/cli.mjs        a single command: read the files, write the pack, print the report
tools/               helpers around Polestar's own tools
```

Nothing under `src/` but `src/node/`, the `cli.mjs` files and `src/i18n/`
touches files or the process: the core takes every input through a
`read(path)` function (a file's text or null), so the command line and the
browser run the same code.

A new source is an adapter that fills the intermediate form; `emit.mjs` and
Polestar's compiler do the rest. Per source:

| Source | How it is read | What Polestar lacks |
|---|---|---|
| RestedXP | [rxp.md](rxp.md) | the known gaps in [rxp.md](rxp.md#known-gaps) |
| Journey | [journey/format.md](journey/format.md), [journey/ir-notes.md](journey/ir-notes.md) | [journey/polestar-gaps.md](journey/polestar-gaps.md) |
| Zygor | [zygor.md](zygor.md) | [zygor/polestar-gaps.md](zygor/polestar-gaps.md) |

## Checking a change

Converts the same guides with a base ref and with the working tree (or
`--head <ref>`), and prints what changed: line kinds, the converter's counts
and lint findings before -> after, and the guides whose text changed. The
packs, reports and `diff.patch` stay in `--out` to read.

```sh
node tools/compare.mjs main --list <RXPGuides/Guides/GuideList-forever.xml> [--out <dir>]
node tools/compare.mjs main --journey <AddOns/Journey>   # or --zygor <AddOns/ZygorGuidesViewerClassic>
```

`--polestar-after <clone>` converts the "after" side against another clone's
data: with the same ref on both sides it measures a data change, such as a
`data build --no-questie`.

## Checking a pack

Polestar's `lint` checks the guides against the game's data; `playtest` plays
every guide to the end for every race and class in the real addon. A whole
pack plays much faster one guide per process:

```sh
tools/playtest-parallel.sh <pack> [--polestar <clone>] [--jobs N]
```

The same plays as `polestar playtest`; exit 1 when any is stuck or failed.
