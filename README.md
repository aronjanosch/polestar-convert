# polestar-convert

Turns leveling guides **you own** into a local [Polestar](https://github.com/fitzforge/polestar)
guide pack (WoW: Forever). It ships no guide content: you point it at your own
install, it writes `.guide` files into your own pack, and Polestar's `lint` and
`playtest` check the result. Keep the output to yourself.

Status: early. Source adapter: RestedXP (`rxp`). Journey is next.

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

The run prints a report: what was dropped, what became a `task`/`note`, and
what needs a human look.

## Layout

```
src/rxp/parse.mjs    RXP Lua -> steps and lines
src/rxp/convert.mjs  RXP adapter: steps -> intermediate guide (src/ir.mjs)
src/ir.mjs           the intermediate form and goal text; no source format in it
src/emit.mjs         intermediate guide -> Polestar .guide text
src/data.mjs         Polestar's reference data (ids, names, coordinates)
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

## Tests

`npm test` (Node 24+, no dependencies).
