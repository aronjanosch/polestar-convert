# polestar-convert

Turns leveling guides **you own** into a local [Polestar](https://github.com/fitzforge/polestar)
guide pack (WoW: Forever). It ships no guide content: you point it at your own
install, it writes `.guide` files into your own pack, and Polestar's `lint` and
`playtest` check the result. Keep the output to yourself.

Status: early. Source adapters: RestedXP (`rxp`), Journey (`journey`).

## Use

```sh
# one-time: a Polestar clone with its reference data
git clone https://github.com/fitzforge/polestar && cd polestar && node tools/polestar.js data build && cd ..

node polestar/tools/polestar.js new my-pack --id my-pack --yes
node polestar-convert/bin/polestar-convert.mjs rxp \
  --file "<WoW>/Interface/AddOns/RXPGuides/Guides/Forever/Horde-01-14_Undead.lua" \
  --polestar polestar --pack my-pack --only "<guide name>"
cd my-pack && node ../polestar/tools/polestar.js lint && node ../polestar/tools/polestar.js playtest
```

Journey (all guides of the install's catalog, chained by Journey's own
"go to the next guide" buttons):

```sh
node polestar-convert/bin/polestar-convert.mjs journey \
  --dir "<WoW>/Interface/AddOns/Journey" --polestar polestar --pack my-pack \
  [--only "<guide name>" | --only <guide id>] [--ah no] [--groups yes|no]
```

Journey's grouping setting becomes Polestar's `when group <quest>`: the player
answers per group quest in game. `--groups yes|no` fixes it instead.

The Journey run also writes `reports/journey-gaps.json` into the pack: per
guide and Journey step id, every condition, choice and goal Polestar cannot
carry and what the converter did instead (a `task` the player ticks, a note,
an optional alternative step, or the route's normal case). What Polestar
would need for each is in JOURNEY-POLESTAR-GAPS.md.

The run prints a report: what was dropped, what became a `task`/`note`, and
what needs a human look.

## Layout

```
src/rxp/parse.mjs    RXP Lua -> steps and lines
src/rxp/convert.mjs  RXP adapter: steps -> intermediate guide (src/ir.mjs)
src/ir.mjs           the intermediate form and goal text; no source format in it
src/emit.mjs         intermediate guide -> Polestar .guide text
src/data.mjs         Polestar's reference data (ids, names, coordinates)
src/journey/         Journey adapter: decode slots, Lua tables, conditions, steps
                     (format: JOURNEY-FORMAT.md; IR wishes: JOURNEY-IR-NOTES.md)
```

A new source (Journey, Zygor) is an adapter that fills the intermediate form;
`--native-verbs abandon,destroy` makes the renderer's input use Polestar's newer
goals instead of tasks.

## Rules the converter keeps

- Ids, names and coordinates come from Polestar's data, never from memory. What
  the data does not know is quoted by name and listed in the report.
- RXP world coordinates (`1420/0,X,Y`) become zone percentages through the map
  frames in `data/forever/map-frames.json`.
- Quest objectives are matched **by name**, not by number: RXP and Polestar
  number a quest's objectives differently.
- RXP's `!Warlock !Mage` becomes the list of the other classes: in Polestar,
  names of one kind OR together, so negations cannot be chained.
- Commands Polestar has no verb for (`.cast`, `.destroy`, `.deathskip`, ...)
  become `task` lines, which need Polestar 0.3.0 (pack format 5).

A whole pack plays much faster one guide per process:
`tools/playtest-parallel.sh <pack> [--polestar <clone>] [--jobs N]` (the same
plays as `polestar playtest`; exit 1 when any is stuck or failed).

## Tests

`npm test` (Node 24+, no dependencies).
