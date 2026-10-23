# Journey's guide format (as the converter reads it)

What the Journey adapter (`src/journey/`) relies on, as Journey 4.00's guide files are laid
out. No guide content here; the examples are made up.

## Files

- `Journey/data/Guides/guides.html`: the catalog. `data/Guides/NNNN.html`: one
  guide per slot (`slot = 20` is `0020.html`). Each file is HTML around one `<p>`
  whose text is base64; decoded, it is a Lua table literal (no code), CRLF lines.
- The catalog table holds `guideVersion`, `minAddonVersion` and one entry per guide:
  `guideID`, `description` ("1-6 Zone"), `condition` (who sees it, e.g.
  `"HORDE and FOREVER"`), `recommended`, `tooltipTitle`, `faction`, `levels`,
  `flags` (`B` bookmark, `S` separator, `F` free), `group` (menu group), `zone`
  (uiMapID), `slot`. Two slots hold a one-step "coming soon" placeholder.

## Lua subset

Tables with array items and `key = value` / `[123] = value` fields; strings in
`"..."` with `\"` escapes; numbers; `true`/`false`; bare names as values
(`SUPPLIES`, `TALENTS`, ... merchant kinds; `ACCEPTED`, ... quest states);
`--` and `--[[ ]]` comments (whole steps are sometimes commented out).

## Guide -> steps -> task groups -> tasks

```lua
{                                   -- guide: array of steps
  {                                 -- step
    id = "01-02", condition = "...", color = "WARRIOR", completed = "...",
    locations = { { "CV|1420|31.3|66.2|6", label = "...", condition = "..." }, ... },
    {                               -- task group (a box in the window)
      condition = "...", completed = "...", buttons = { { target = 123 }, ... },
      "plain text",                 -- a text task
      { "text ", { npc = 123, label = "bats" }, " more", condition = "..." },  -- multitext
      { npc = 123 },                -- names the NPC (giver/ender for what follows)
      { accept = 456 }, { turnin = 456 }, ...
    },
  },
}
```

A step is done when all its groups are; a group when all its tasks are (or its own
`completed` expression holds); `optional = true` tasks never hold it.

### Tasks (the key that decides the type)

| Task | Meaning |
|---|---|
| `accept = Q` / `turnin = Q` | quest accepted / handed in; `acceptone = {Q, ...}` any one of them |
| `complete = Q` [`objective = n` \| `objectives = {..}` \| `seq = n`] | do the quest (or those objectives: game quest-log order) |
| `startwork = Q` [`objective`] | start on a quest's work; optional unless `optional = false` |
| `npc = N` | talk to / target text; no completion of its own |
| `gameobject = O` | click an object (text) |
| `getitem = I` [`quantity`, `questid`] | have I in the bags (done early when `questid` is complete) |
| `merchant = SUPPLIES\|REPAIRS\|TALENTS\|WEAPONSKILLS\|TRADESKILLS\|STABLEIN\|STABLEOUT` | visit that kind of vendor/trainer |
| `level = L` [`xp = X`] | reach the level (X xp into it) |
| `learntaxi = T` / `taketaxi = T` [`fromnpc`] | discover / fly to taxi node T (TaxiNodes id) |
| `sethearthstone = A` [`fromnpc`] | bind at the inn of area A (AreaTable id); `hearth = A` |
| `deposit`, `withdraw` | bank items listed beside it |
| `die`, `spiritres` | death skip (only when not hardcore) |
| `button = "Text"`, `goto = "<step id>"\|"next"`, `guide = "<id>"` | a jump button (choice, skip) |
| plain string / table of strings and inline refs | text |

Other task fields: `condition`, `completed` (Lua boolean expression, `COMPLETE` =
the task's own check), `optional`, `limit`, `auto`, `oncomplete`/`onleave`
(Lua run on events), `color`, `icon`.

Inline refs in text: `npc`, `item`, `spell`, `quest`, `area` (AreaTable id or
name), `zone` (uiMapID), `gameobject`, `taxi`, `location` each with an optional
`label` (the shown text); formatting `red`, `bold`, `tip`, `italic`, `note`,
`paragraph`, `newline`, `skipped`; `illustration`, `icon`, `scale`.

Buttons: `target`/`targets` (NPC ids), `item` (use), `spell`, `destroy` (item),
`alert`, `label`, `condition`.

### Locations

`"FLAGS|uiMapID|x|y[|radius]"`; percentages of the zone map, as Journey's
`C_Map` reads them in the Forever client; `W` makes x/y world coordinates.
Fields: `label`, `npc`, `gameobject`, `item`, `area`, `wmoarea`, `zone`,
`condition`, `onenter`/`onleave`/`onactivate`.

| Flag | Meaning |
|---|---|
| (none) | a target: shown while it is the active location |
| `C` | checkpoint: walked in order; reaching one makes the next active |
| `V` | always shown on the map |
| `H` | hidden: an area for `WITHIN[i]`/`EXITED[i]` checks (radius), never a waypoint |
| `W` | x/y are world coordinates |

## Conditions

A Lua expression (`and`, `or`, `not`, `==`, `~=`, `<`, `<=`, `>`, `>=`,
parentheses, `T[k]` lookups). Names that are fixed for a Forever character:

- `ERA` and `FOREVER` true (client 1.16+); `TBC`, `WOTLK`, `CATA`, `SOD`, `SOD2`,
  `SOM1`, `SOM2` (a buff), `JOYOUS` (a buff), `SKYBORNE` false or unset; `PHASE` = 6.
- Class (`WARRIOR`, ...), race (`ORC`, `SCOURGE`, `NIGHTELF`, ...) and faction
  (`HORDE`, `ALLIANCE`) names: true for the player's own.
- Settings: `HC` hardcore (off by default), `AH` auction house (on by
  default), `GROUPS` group quests (on by default). Guide ids: true when installed.

Runtime state: `QUEST[q]` compared with `NONE` 0, `ACCEPTED` 1, `COMPLETED` 2,
`TURNEDIN` 3, `FAILED` -1; `OBJECTIVE[q][n]`; `ITEM[i]`, `BANKITEM[i]`; `LEVEL`,
`LEVELD`, `XP`; `MONEY` (copper); `SPELL[s]`; `HASTAXI[t]`; `HEARTHSTONE[a]`;
`ZONE`, `AREA`, `WMOAREA`; `BUFF[s]`; `REP[f]`; equipment slots (`RANGED`, ...);
location state `WITHIN[i]`, `VISITED[i]`, `EXITED[i]`, `ACTIVE`, `CHECKPOINT`;
`COMPLETE`, `ROOT_COMPLETED`, `SEEKING`; custom variables `VAR.x`, `GUIDE.x`.
