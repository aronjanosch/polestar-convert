# polestar-convert

Turns leveling guides **you own** into a local [Polestar](https://github.com/fitzforge/polestar)
guide pack (WoW: Forever). It ships no guide content: you point it at your own
install, it writes `.guide` files into your own pack, and Polestar's `lint` and
`playtest` check the result. Keep the output to yourself.

Status: early. Source adapters: RestedXP (`rxp`), Journey (`journey`).

## Use

```sh
# one-time: a Polestar clone with its reference data
# (Polestar's `next` branch; `--questie <WoW>/Interface/AddOns` when it does not find QuestieDB)
git clone -b next https://github.com/fitzforge/polestar && cd polestar && node tools/polestar.js data build && cd ..

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

A whole pack plays much faster one guide per process:
`tools/playtest-parallel.sh <pack> [--polestar <clone>] [--jobs N]` (the same
plays as `polestar playtest`; exit 1 when any is stuck or failed).

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

A new source (Journey, Zygor) is an adapter that fills the intermediate form.

## Rules the converter keeps

- Ids, names and coordinates come from Polestar's data, never from memory. What
  the data does not know is quoted by name and listed in the report.
- RXP world coordinates (`1420/0,X,Y`) become zone percentages through the map
  frames in `data/forever/map-frames.json`.
- Quest objectives are matched **by name**, not by number: RXP and Polestar
  number a quest's objectives differently.
- RXP's `!Warlock !Mage` becomes the list of the other classes: in Polestar,
  names of one kind OR together, so negations cannot be chained.
- Commands Polestar has no verb for (`.deathskip`, `.equip`, a `.cast` of a
  spell no RXP line names, ...) become `task` lines. These, and the goals and
  conditions below, need Polestar 0.3.0 (pack format 5).
- `.abandon`, `.destroy` and `.cast` are Polestar's `abandon`, `destroy` and
  `cast` goals, which check themselves. A spell's name comes from RXP's lines
  that cast it (`[Teleport: Moonglade]`). `.usespell` is a button in RXP that
  never holds the step: an optional `cast`, or left out without a name.
- `.skill cooking,50,1` (RXP skips the step from rank 50 on) is
  `when !skill Cooking 50`; `<50` is `when skill Cooking 50`.
- `.money <0.1` (RXP skips the step while the character has less) is
  `when money>=1000`; `>N` is `when money<N`, in copper.
- `.cooldown item,6948,>0` (skipped while the Hearthstone cools down) is
  `when !cooldown item 6948`, `<0` is `when cooldown`. RXP counts at least
  2 seconds; longer thresholds (`<600`) have no Polestar form and stay out.
- `.zone Ironforge` in a travel step is `enter "Ironforge"` at RXP's last point:
  done on entering the zone, as in RXP. Beside the route (`#completewith`) it
  stays a way into the next step.
- RXP's `#next A; B << !Hunter` becomes `next A, B` when the guides named are,
  together, for every character of this one: Polestar offers each character
  the options whose guide is for them (a Hunter route only to Hunters). A
  guide for some characters alone would send everyone there, so it is left out.
- `.group` on a step about one quest is `when group <quest>`: Polestar asks
  once per quest, or takes the player's "Group quests" option. RXP marks every
  step of a group quest so, the accept included, and a quest not taken takes its
  later goals with it. A step about several quests keeps its group goals
  optional.

## How it differs from RestedXP

The route, quests and text are RXP's; how a step runs is Polestar's. The rule:
a step RXP shows holds in Polestar until it is done, ticked or skipped.
Nothing passes unseen.

RXP shows a `#completewith X` step beside the steps after it and closes it
when X is done. Polestar's `along` is passed over at once, lists only goals
(never notes) under *Along the way*, and `along until X` ends when the route
*reaches* X. So the converter sorts RXP's step by what it holds. The rule
comes from a catalog of all N text-only steps and some read by hand:

| RXP step holds | Polestar | Example |
|---|---|---|
| text + a farming signal (`.mob`, `.money`, `.itemcount <N`, an `.xp` target) | a step of its own: `task` to tick, `@` the middle of RXP's points | "Loot until 50 copper" |
| text + arrow points only (no `,0`) | the way into the next step; the text a `note` there | "Enter the cave" |
| text alone | `task` under *Along the way* up to and through X | "Save up your Linen Cloth" |
| countable goals (kill, collect, objectives, buys) | `along` up to and through X | kills beside the next step |
| goals that check themselves (fly, hearth, vendor, use, cast, destroy, abandon) | a step that holds | "Destroy the Hearthstone" |

"Up to and through X": the label goes on the step after X (`<label>-end`,
`stepN-end` for `#completewith next`).

- **Waypoints:** points without an arrow (`,0`) and the points of a step that
  farms or fights are rounds, not ways, and are left out; Polestar finds the
  spots itself (*Next spot*). Of a way, a goal with a place of its own keeps
  the last point and those on another map (leaving a city); one without a
  place (`fly`, `sethome`) keeps every point. Repeated points go.
- **A step whose goals are all optional** (elite, group, `#optional`,
  training) keeps them required, since Polestar passes such a step at once.
  Polestar's lint suggests `when group <quest>` for elite work instead.
  Skip it to leave it. If it is about one quest the player may not have, it
  shows only while on that quest (`when onquest`). An optional turn-in stays
  optional, and a step of optional waypoints alone still passes.
- **Steps and goals for races the guide is not for** are left out (RXP's
  "You have selected a guide meant for Undead" in an Undead guide).
- **The play style is fixed:** not self-found (`#ah` kept, `#ssf` dropped),
  softcore, 1× XP, Season 0, phase 6. Group steps are kept: the player
  chooses them in Polestar (`when group`).

### Known gaps

- Step numbers count every class's steps ("3 / 72"); RXP counts only yours.
  A Polestar change, not the converter's.
- A `goto` radius is the arrival radius only; Polestar draws no area. A text
  step gets one point, not a circle.
- A step with no title shows its first goal as the heading, so a one-task step
  reads twice. RXP has no titles to give it.
- `.subzoneskip` area ids have no name table: N lines.
- Six `#include`s name guides outside the list.
- `.cast` of a spell no RXP line names stays a task (`.cast 6477`, clicking an
  object): N lines.
- Riding (`.skill riding`) is no profession in Polestar: ignored.
- `#requires X` is not carried over: RXP holds the step while X is
  still shown beside the route; Polestar's `when done X` would pass it by
  instead, and drop it whenever X was skipped.
- `.bankdeposit`/`.bankwithdraw` stay tasks: RXP checks the bank, which
  Polestar cannot see. `.isQuestAvailable a,b` (any of them) is left out:
  Polestar's `when available` takes one quest.

### Against petllama/rxp-free-guides

petllama writes RXP's text beside the route as `along` notes, which Polestar
never lists, and splits class variants into one step per class, so the same
text appears several times. Here the text is a task in one step, with `only`
per line.

## Tests

`npm test` (Node 24+, no dependencies).
