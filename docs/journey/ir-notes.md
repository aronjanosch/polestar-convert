# Wishes for the intermediate form (from the Journey adapter)

`src/ir.mjs` and `src/emit.mjs` are unchanged on this branch. What the Journey
adapter works around today, and what would carry Journey over more faithfully.
Each entry: what Journey has, the workaround, the wish.

## Goal kinds

- **`talk {npc}`.** Journey's `{ npc = N }` task beside no quest goal ("talk to
  X", a gossip step). Today: nothing (the text stays as a tip). Wish: a `talk`
  goal, rendered as Polestar's `talk <npcId>`.
- **`money {amount}`.** Journey's `completed = "MONEY >= 60"` on a text group
  ("loot until you have 60 copper"). `emit.mjs` already treats `money` as
  never-blocking in its `optional` check, but `goalText` has no `money` case and
  throws. Wish: `money {amount}` -> `money <amount>` (pack format 5).
- **`learn {spell, name?}`.** Journey's text "learn [spell]" next to
  `merchant = TALENTS` and `completed = "... or SPELL[6673]"`. Today: `train
  <npc>`. Wish: `learn <spellId>` (Polestar's `learn`), so the step checks the
  spell rather than a trainer visit.
- **`cast {spell, name?}`.** Journey's spell buttons (Teleport: Moonglade,
  summon pet; 20 in the 1-30 guides). Today: `task "Cast X"` the player ticks.
  Wish: `cast <spellId> ["Name"]` (Polestar 0.3.0, format 5), which checks the
  cast itself.
- **`enter {place, at?}`.** Journey's travel steps done on `completed =
  "ZONE == z"`, `AREA[a]` or `WITHIN[i]` (about 17 of the 49 manual tasks).
  Today: `task` to tick. Wish: `enter "<Zone or subzone>"` (Polestar 0.3.0,
  format 5); the adapter has the names (AreaTable, WMOAreaTable via
  `src/journey/names.mjs`).
- **`collect ... npc <id>`.** Journey's `getitem` handed over in a gossip window,
  beside `{ npc = N }`. Wish: an optional `npc` field on `collect`.

## Goal modifiers

- **`optional` on `task` and `use`.** Polestar takes `task "..." optional` (a
  task that never holds the step), but `emit.mjs` leaves `optional` off `note`
  and `task`. The adapter therefore writes item buttons (154) as notes and
  spell casts as tasks the player ticks. Wish: write `optional` on tasks too,
  so an item button can be `use <item> optional` beside the step's goals.

## Step fields

- **Labels for `when done`.** Journey marks steps as done with its own
  variables (`oncomplete = "VAR.X = true"`) and later steps test them
  (`not VAR.X`), in 162 steps of the 1-30 guides. Polestar's `when done <label>`
  / `when !done <label>` is the exact match, but `emit.mjs` writes a step's
  `label` only when an `along until` waits for it. Today the adapter reads the
  marker as set once a step before has set it (no `when`). Wish: write `label`
  whenever a step has one, and let `whens` hold `done <label>`.

- **`skipto [{label, when}]`.** Journey's step `completed` expressions
  (`"ITEM[x] == 0 or QUEST[q] >= TURNEDIN"`, 202 in the 1-30 guides) skip a step
  when its work is already done another way. Today: ignored (counted in the
  report). Wish: a step-level `skipto <label> when <predicate>` list, or a
  `whens` alternative that renders several `step` copies for an OR.
- **Goal-level `when`.** Journey puts runtime conditions on single tasks
  (`{ turnin = q, condition = "QUEST[q] >= COMPLETED" }`). Polestar has `when`
  on steps only, so the adapter splits a step into consecutive steps by the
  `when` each goal needs. Nothing to change if that stays the way; noting it so
  the renderer does not merge such steps back.
- **Text for some characters only.** Journey's inline text pieces carry their
  own class conditions; the adapter renders one text per group of characters
  who read it alike and writes those as `note ... only <classes>`. A step-level
  `tips: [{ text, only }]` would let them stay tips (shown under the title)
  rather than notes in the goal list.

## Step `when` predicates

The adapter writes `when skill <Profession> <N>` and `when group <quest>`
(Polestar 0.3.0) as plain `whens` strings and raises the step's `format` to 5
itself. Nothing to change unless the renderer starts to derive the format
from the predicates it writes.

## Guide fields

- **Conditional hand-offs.** Journey's jump buttons carry conditions
  (`condition = "HUNTER"`, `QUEST[x] >= ...`). Today: every jump that can show is
  a plain `next` option. Wish: `next: [{ slug, when? }]` -> `next <id> when
  <predicate>`.
- **`pitch`.** Journey's catalog has `tooltipTitle` ("Recommended for ..."), a
  natural one-line pitch for a route choice card. Wish: `guide.pitch`.
