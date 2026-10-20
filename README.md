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

## How it differs from RestedXP

The route, quests and text are RXP's; how a step runs is Polestar's. The rule:
a step RXP shows holds in Polestar until it is done, ticked or skipped.
Nothing passes unseen.

- **Text alone** (`+…` or `>>…` with no goal, often `#completewith`) is a
  step of its own: a `task` to tick, at the middle of RXP's waypoints (`@x,y`). RXP
  closes such a step itself when its target step is done; here you tick it
  or skip it.
  - Polestar's *Along the way* never lists notes, and `along until X` ends
    when the route *reaches* X, so text left there never showed.
- **Countable work beside the route** (`#completewith` or `#sticky` with kills,
  items or quest objectives) is an `along` step. It stays listed up to and
  through its target, as in RXP: the label goes on the step after the target
  (`<target>-end`).
- **`destroy` / `abandon`** hold their step; they check themselves off.
- **Farming rounds** (RXP's `.goto …,40,0` beside text) are not written as
  waypoints. For kills and items, Polestar finds the spots itself (*Next spot*).
- **A step whose goals are all optional** (elite, group, `#optional`) keeps
  them required, since Polestar passes such a step at once. Skip it to leave
  it. If it is about one quest the player may not have, it shows only while on
  that quest (`when onquest`). An optional turn-in stays optional.
- **Steps and goals for races the guide is not for** are left out (RXP's
  "You have selected a guide meant for Undead" in an Undead guide).
- **The play style is fixed:** not self-found (`#ah` kept, `#ssf` dropped),
  softcore, 1× XP, Season 0, phase 6. Group steps are kept, as optional
  group work.

### Known gaps

- Step numbers count every class's steps ("3 / 72"); RXP counts only yours.
  A Polestar change, not the converter's.
- A step with no title shows its first goal as the heading, so a one-task step
  reads twice. RXP has no titles to give it.
- `.subzoneskip` area ids have no name table: N lines.
- Six `#include`s name guides outside the list.
- `.cast`, `.usespell` and skill conditions stay tasks until Polestar has verbs
  for them.

### Against petllama/rxp-free-guides

petllama writes RXP's text beside the route as `along` notes, which Polestar
never lists, and splits class variants into one step per class, so the same
text appears several times. Here the text is a task in one step, with `only`
per line.

## Tests

`npm test` (Node 24+, no dependencies).
