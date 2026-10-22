# Development

Node 24+, no dependencies.

```sh
npm test
```

## Layout

```
bin/polestar-convert.mjs  the command: picks the adapter, writes the pack
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
src/zygor/cli.mjs    the run: chain, accepts of the chain, files, gaps report
tools/               helpers around Polestar's own tools
```

A new source is an adapter that fills the intermediate form; `emit.mjs` and
Polestar's compiler do the rest. Per source:

| Source | How it is read | What Polestar lacks |
|---|---|---|
| RestedXP | [rxp.md](rxp.md) | the known gaps in [rxp.md](rxp.md#known-gaps) |
| Journey | [journey/format.md](journey/format.md), [journey/ir-notes.md](journey/ir-notes.md) | [journey/polestar-gaps.md](journey/polestar-gaps.md) |
| Zygor | [zygor.md](zygor.md) | [zygor/polestar-gaps.md](zygor/polestar-gaps.md) |

## Checking a pack

Polestar's `lint` checks the guides against the game's data; `playtest` plays
every guide to the end for every race and class in the real addon. A whole
pack plays much faster one guide per process:

```sh
tools/playtest-parallel.sh <pack> [--polestar <clone>] [--jobs N]
```

The same plays as `polestar playtest`; exit 1 when any is stuck or failed.
