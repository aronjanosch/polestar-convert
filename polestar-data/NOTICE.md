# Reference data for polestar-convert's web page

This folder holds the game data the converter reads: Polestar's `data/forever`
(quests, NPCs, objects, items, zones, map frames, races, travel network,
professions, the codex's dungeon journal) and three client tables (AreaTable,
SpellName, WMOAreaTable), built with Polestar (https://github.com/fitzforge/polestar, commit 772b206589a1ba2a9210461955121e41d4a3907e)
on 2026-10-23T15:45:37.644Z.

**Licence.** This data set is distributed under the GNU General Public License,
version 3 (see LICENSE in this folder), because it is derived from
QuestieDB and Questie, whose licence since 2026-10-21 names GPLv3 as the target licence (their maintainers are fine with copying under GPLv3, name and logo excluded; they cannot confirm it for every past contributor), and from Polestar (GPLv3). polestar-convert's own code is MIT; this folder is not part of it.

If QuestieDB's licence does not allow it, the set is rebuilt without QuestieDB
(`polestar data build --no-questie`); the page then says so.

**Sources** (from the data build's meta.json; details in sources.json):

- pfQuest (https://github.com/shagu/pfQuest): MIT
- World of Warcraft Classic Era client tables (UiMap, UiMapAssignment, AreaTable, Faction) via wago.tools (https://wago.tools/db2?build=1.15.9.70003): Blizzard Entertainment game client data; factual map geometry, names and faction hierarchy only
- QuestieDB (Questie-Forever), baked Forever store and support data (https://github.com/Questie/QuestieDB): No license file in Questie/Questie or Questie/QuestieDB; CurseForge lists GPL-3.0, and the maintainers ask that it be treated as all rights reserved (https://github.com/Questie/Questie/issues/4447). Read from the local install; facts only (quest, NPC, object and item facts, no code or text) ship in 
- World of Warcraft: Forever client tables (UiMap, UiMapAssignment, AreaTable, ChrRaces, ChrClasses, CharBaseInfo, Faction, Map, ItemSparse) via wago.tools (https://wago.tools/db2?build=1.60.1.70450): Blizzard Entertainment game client data; factual map geometry, names, item durations and race/class combinations only
- CMaNGOS classic-db: creature and gameobject spawn heights (https://raw.githubusercontent.com/cmangos/classic-db/22b51464f1625f6ef6275771de1f5466c6f5d19e/Full_DB/ClassicDB_1_12_1_z2815.sql.gz): GPL-3.0; spawn heights (z) only, used as facts like the transport periods: a guide goal, spawn spot or smart-target candidate at an NPC or object (and Core/ClassTrainers.lua's class trainers) carries its spawn's height
- CMaNGOS classic-db: quest objective counts (https://raw.githubusercontent.com/cmangos/classic-db/22b51464f1625f6ef6275771de1f5466c6f5d19e/Full_DB/ClassicDB_1_12_1_z2815.sql.gz): GPL-3.0; quest objective counts only, used as facts: an objective whose count QuestieDB and pfQuest lack takes the matching quest_template count

**Source code** to rebuild it: Polestar at the commit above, then

    node tools/polestar.js data build --no-web-xp --no-wowhead
    node tools/polestar.js travel build
    node tools/polestar.js profession build
    node tools/polestar.js codex build
    node <polestar-convert>/tools/pages.mjs --polestar .

World of Warcraft is a trademark of Blizzard Entertainment, Inc. Neither this
data nor polestar-convert is affiliated with or endorsed by Blizzard, Questie,
RestedXP, Journey, Zygor or Polestar.
