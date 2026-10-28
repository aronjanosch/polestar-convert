# Translations

Polestar shows game names (NPCs, quests, items, places, spells) in the
client's own language for every source. RestedXP also ships translated
guides (`RXPGuides/lang/Guides-<locale>/`, with the language's own
`GuideList-forever.xml`), and their text goes into the addon as a language
addon beside it, `<addon>_<locale>`, which Polestar loads on a client in that
language.

The page adds the language picked on it; the command line every language RXP
ships, or those of `--locales zhCN,deDE` (`none` for none). The texts to fill
are the compiler's (`Compiler.texts()`, as Polestar's `i18n guides sync` lists
them); src/rxp/translations.mjs fills them, and the compiler leaves out, with a
warning, a translation Polestar would refuse (a token lost, a broken format).
The names of each language (names packs, client tables) come with the game
data from the page's site. Nothing of the guides is sent.
- Shown translated: game names (NPCs, quests, items, places, spells) for every
  source, since Polestar shows the client's own names; for RXP also the guide
  words RXP translated. Where a guide's own translation lacks a line (a guide
  file RXP ships no translated copy of, a step it left out, a text it marks
  "NOT TRANSLATED"), the line comes from any other guide RXP translated it in,
  for every game version RXP ships.
- The translated guide is converted by its English words: the inn, vendor,
  trainer, level goal and step titles come out as in the English guide, so each
  translated text lines up with its English one.
- A name RXP's translator spelled their own way still finds its place: the
  bracket at the name's place (`[...]`), or the one spot one character off the
  game's name.
- A text that pairs with nothing takes the translation of a text of the same
  shape: "Talk to {npc}" translated once serves every NPC, a name in the plural
  counts as its singular, a list of names ("A, B and C") as one name, and a text
  of several lines or sentences is filled line by line and sentence by sentence.
  A text whose lines are only partly found keeps the rest English; the report
  counts it as "partly translated".
- The converter's own sentences (the elite tip, tasks it writes itself) come
  translated for Chinese.
- Left English: Journey's and Zygor's own words (a sentence they share with RXP
  may come translated), and RXP's words no guide of RXP has translated.
- A new Forever NPC whose name the game has not shown yet appears in English
  inside a translated sentence until the player has seen or targeted it once.
- `reports/rxp-locales.json` (command line): per language, the texts, how many are
  translated (fully or partly), and the causes for texts left English, with
  examples per guide.
- Each run fills the texts afresh: a newer RXP translation or a converter fix
  shows on the next run.
