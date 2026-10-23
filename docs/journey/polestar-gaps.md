# What a one-to-one Journey conversion still lacks

Measured on Journey's 37 Forever guides (1-30) with `polestar-convert journey`,
against Polestar `next` (0.3.0: #605/#645, #606, #607, #608/#637, #609 merged).
Per step, the pack's `reports/journey-gaps.json` lists each case and what the
converter did instead: a `task` the player ticks, a note, an alternative step
with "Only if …", or the route's normal case.

Three parts: what the converter already uses, what Polestar has but the
intermediate form (`src/ir.mjs`, `src/emit.mjs`) cannot carry yet, and what
Polestar itself lacks. Counts are Journey steps or constructs.

## Used by the converter

| Polestar | Journey construct | Count |
|---|---|---|
| `destroy <item>` (format 5) | destroy buttons | 27 |
| `when skill <Profession> <N>` | `FIRSTAID >= APPRENTICE`, `FIRSTAID_POINTS`, `COOKING_POINTS` | 8 steps |
| `when group <quest>` | the `GROUPS` setting: the player answers per quest in game (`--groups yes/no` fixes it) | 38 steps |

Not needed for Journey: `when cooldown` (Journey has no cooldown condition),
`when upgrade` (no such steps).

## Polestar has it, the intermediate form does not (IR/emit side)

Details and the wished-for fields in [ir-notes.md](ir-notes.md).

| Polestar | Journey construct | Count | Today |
|---|---|---|---|
| `skipto <label> when <predicate>` | step `completed` expressions (work done another way) | 202 | ignored |
| `label` + `when done <label>` | `VAR` markers set by `oncomplete` | 162 | read as set once a step before set it |
| `cast <spellId>` | spell buttons and "cast …" text | 20 | `task "Cast …"` |
| `enter "<Place>"` | travel steps done on `ZONE`/`AREA`/`WITHIN` | about 17 of the 49 manual tasks | `task` |
| `use <item>` with `optional` | item buttons beside a step's goals | 154 | `note "Use …"` |
| `optional` on `task` | buttons for things Polestar cannot see | | task that holds |
| `talk <npc>` | `{ npc = N }` without a quest goal | | tip only |
| `money <amount>` goal | `completed = "MONEY >= N"` | a few | left out |
| `learn <spell>` | "learn [spell]" beside a trainer | | `train <npc>` |
| `next <id> when <predicate>` | conditional jump buttons (class, spell, quest) | a few per chain | every jump a plain `next` |
| `task "…" @x,y` | text steps with a place | | task without a place (master's IR has `at`) |

## Polestar lacks it

### Conditions

| Wish | Journey construct | Steps | Today |
|---|---|---|---|
| `when objective <quest>.<n>` | `OBJECTIVE[q][n]`: steps and texts by how far a quest is | 188 | read as "not done yet" |
| `when known <spellId>` | `SPELL[s]`: teleport known, trainer visited, mount learnt | 89 | read as "not learnt" |
| `when dead` / `when ghost` | `GHOST`, `DEADORGHOST`: death-skip routes | 60 | read as "alive" |
| `when grouped` (in a group now) | `INGROUP` (escort with or without a group) | 4 | read as "solo" |
| `when equipped <slot> <kind>` | `RANGED`, `RANGEDSUBCLASS` | 4 | left out |
| `when bank has <item>` | `BANKITEM[i]` | 2 | left out |
| `when failed <quest>` | `QUEST[q] == FAILED` (escort failed: abandon, take again) | 2 | left out |
| profession tier above Apprentice | `FIRSTAID >= JOURNEYMAN` (tier learnt, not skill points) | 2 | left out |

### Goals

| Wish | Journey construct | Count | Today |
|---|---|---|---|
| `die` / `spiritres` | death-skip tasks | 2 (+60 `GHOST` steps) | `task` |
| `bank deposit` / `withdraw <item>` | `deposit`, `withdraw` | 11 | `task` |
| `stable` / `unstable` | hunter `merchant = STABLEIN/STABLEOUT` | 4 | `task` |

### Choices, hand-offs, navigation

| Wish | Journey construct | Count | Today |
|---|---|---|---|
| `next <guide> at <label>` (start the next guide at a later step) | `guide = "<guide id>", goto = "<step id>"` ("Skip to <zone>") | a few per chain | the next guide from its start |
| Waypoints shown only while in or out of an area (non-blocking path hints) | `C`/`V` locations with `WITHIN`/`EXITED`/`VISITED` | ~830 groups | left out, or blocking `goto`/`loop` |
| Text by where the player stands | `WITHIN`/`ACTIVE` text variants | many | the "not there yet" variant |

Polestar's Skip button covers Journey's "Skip This?" (132) and most jump
buttons (141); the converter writes a note pointing at it.

## Data

- Building names (WMOAreaTable): Journey checks `WMOAREA` by the Era client's
  WMOAreaTable ids. Polestar's data build does not fetch that table; the
  converter reads it from Polestar's wago cache after
  `cachedTable({ table: "WMOAreaTable", build: <Era build> })`. With it, 2172
  building names and the `WMOAREA` conditions (as `subzone`) carry over.
- Spell names for a few TBC/WotLK ids Journey mentions in shared text (6).
