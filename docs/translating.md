# Translating Lumière

Lumière's interface is available in **French** (source language), **English**, **Spanish** and
**Simplified Chinese**. Adding a language takes one JSON file — no code changes.

## How translations work

- Every interface string is written in French in the code and wrapped in `t()`:
  `t("Enregistrer")`. The French text is the key.
- Each language is a file `src/locales/<code>.json` that maps the French text to its
  translation. Files are discovered automatically and appear in the *Language* menu
  and in *Edit → Settings…*.
- A missing translation falls back to French, so a partial translation never breaks the app.
- Parameters in braces are replaced at run time and must be kept as-is:
  `"{n} lignes": "{n} lines"`. You may move them within the sentence.
- Messages coming from the Rust core (driver errors, G-code warnings) use numbered parameters
  `{0}`, `{1}` and are translated the same way.

## Add a new language

1. Generate the up-to-date template:
   ```sh
   npm run i18n
   ```
2. Copy `src/locales/_template.json` to `src/locales/<code>.json`, where `<code>` is a
   [BCP 47](https://www.rfc-editor.org/info/bcp47) language tag: `de`, `it`, `pt-BR`, `ja`…
3. Fill in `_meta`:
   ```json
   "_meta": { "code": "de", "name": "Deutsch", "english": "German" }
   ```
   `name` is the language's name **in that language**, `english` its English name; the
   *Language* menu shows both: *Deutsch (German)*.
4. Translate the values. Leave a value empty (`""`) if you are unsure: French will be shown.
5. Check your work:
   ```sh
   npm run i18n        # completion of each language
   npm test            # fails if a parameter is missing or misspelled
   npm run tauri dev   # try it in the app (Language menu)
   ```
6. Open a pull request. Partial translations are welcome; say how complete it is.

The app picks the system language automatically when a matching file exists, then remembers
the user's choice.

## Update an existing language

When the interface changes, new keys appear. Run:

```sh
node scripts/i18n.mjs --verbose
```

It lists, for each language, the missing keys and the file where each one is used, and the
keys that are no longer used (you can delete those).

## Guidelines

- Use the terms of the laser community in your language (what the users of other laser software
  call a *layer*, *fill*, *framing*, *kerf*…). Consistency matters more than literal accuracy.
- Keep translations short: buttons and labels have little room.
- A key such as `undo::Annuler` carries a context before `::`: translate only the meaning it
  names (here *Undo*, not *Cancel*).
- Keep keyboard shortcuts (`⌘Z`, `⌥O`…), units (`mm`, `mm/min`) and G-code (`$H`, `M8`) unchanged.
- Product names (GRBL, Ruida, FluidNC, RDWorks) are not translated.
- Typography follows your language: `“…”` in English, `«…»` in French and Spanish, `“…”` and
  full-width punctuation in Chinese.

## For developers

- Wrap new strings in `t("…")` where they are displayed. Inside module-level constants
  (tables evaluated once when the module loads), mark the string with `tk("…")` and call
  `t(value)` where it is rendered, so it follows language changes.
- Use named parameters instead of string concatenation, so translators can reorder words:
  `t("Calque « {name} » : …", { name })`.
- New Rust messages shown to users must be added to `RUST_MESSAGES` in `src/i18n/index.ts`,
  with `{0}`, `{1}` for their variable parts.
- Native menu labels in `src-tauri/src/menu.rs` are translated through `tr()`; the extraction
  script picks them up automatically.
- When one French word has two meanings, prefix the key with a context: `t("undo::Annuler")`
  (Undo) is a different key from `t("Annuler")` (Cancel). French shows the text after `::`.
- `node scripts/i18n.mjs --suspects` lists French strings that do not go through `t()` yet.
