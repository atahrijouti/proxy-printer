# Plan — typed overlays for the HTML printer

Move the HTML printer off **baked HTML overlay strings** (rendered via `innerHTML`) onto
a **typed `overlays` array** that the renderer turns into real DOM nodes. This aligns the
printer with `docs/goal.md` footnote #1 (ordered array of typed `image`/`shape`/`text`
overlays) and removes `innerHTML` entirely.

Under this plan we keep pretending the browser-print determinism gaps are solved (see the
seven "pretends"); this task is the structural part that needs no magic.

## Scope

- **New DB** `proxy-db-lorcana/db-type-html-print.json` — do **not** touch existing DBs.
- **New parser + typed renderer** in the printer — replace the `innerHTML` overlay path.
- Keep styling as CSS classes referenced by name (HTML printer stays "married to CSS").
  Point `stylesUrl` at a copy so the existing `lorcana.css` is untouched; add the
  `keyword` / `reminder` / `ability-name` classes it needs.

Out of scope for this step: shape primitive has no data yet; frame ownership; card backs.

## Schema

```ts
type Card = {
  id: string
  image: string                 // base layer (was imageUrl)
  overlays?: Overlay[]          // ordered; array order = paint order (painter's), no z-index
}

type Overlay =
  | { type: "image"; style?: string; image: string }              // e.g. the amber-glimmer frame
  | { type: "shape"; style: string }                              // content-less; form/size/pos from style
  | { type: "text";  style?: string; content: string | string[] } // string[] = paragraphs (<p>)

type DB = {
  cardBack?: string
  presentation?: {
    stylesUrl?: string
    abbreviations?: Record<string, Abbreviation>
  }
  cards: Card[]
}

type Abbreviation =
  | { type: "text";  value: string }
  | { type: "image"; src: string }   // src = anything valid in <img src>; symbols are these
```

- `style` maps to a CSS class name; base positioning comes from a shared `overlay` class.
- Base layer is `image`; overlays render in array order on top.

## Inline grammar (inside `text.content`)

A tiny function-call grammar. First token = function; positional args follow. Emits
**typed nodes**, never an HTML string. `\}` escapes a literal brace. Single braces (no
variable interpolation, so collisions are near-zero).

```
{t <style> <content…>}   → <span class="<style>"><content></span>   (tagged span)
{abbr <name>}            → the registered abbreviation (text → text node; image → <img src>)
```

Examples:

```
{t keyword Sångare} 5
{t reminder (Denna karaktär räknas som kostnad 5…)}
{t ability-name Musikalisk debut} När du spelar…
{abbr exert}
```

- `t` takes `<identifier> <content…>` — content is the rest of the token and may contain spaces.
- `abbr` takes a single registered name; unknown name → leave literal (or dev warning).
- Grammar is **open**: a third function later needs no grammar change. Only `t`/`abbr` exist today.
- Rationale: fixed function names keep provider identifiers (`keyword`, …) in argument-space, so
  a DB can name a style anything without colliding with the grammar. We borrow Handlebars'
  first-token-is-the-function ergonomics but not the library (it emits strings and carries a
  general-purpose engine we don't want a DB provider to have).

## Style-name mapping (from the old baked HTML)

| old | new |
| --- | --- |
| `<b>`    | `{t keyword …}` |
| `<i>`    | `{t reminder …}` |
| `<mark>` | `{t ability-name …}` |
| `<img class="glyph" src=…>` | `{abbr <name>}` (registry) |
| `name` / `title` / `traits` / `text` overlay classes | unchanged, now `text` overlays |

## Worked example (Ariel)

```json
{
  "cardBack": "http://localhost:8787/images/card-back.jpg",
  "presentation": {
    "stylesUrl": "http://localhost:8787/styles/lorcana.css",
    "abbreviations": {
      "exert":     { "type": "image", "src": "http://localhost:8787/images/symbols/exert.svg" },
      "ink":       { "type": "image", "src": "http://localhost:8787/images/symbols/ink.svg" },
      "lore":      { "type": "image", "src": "http://localhost:8787/images/symbols/lore.svg" },
      "strength":  { "type": "image", "src": "http://localhost:8787/images/symbols/strength.svg" },
      "willpower": { "type": "image", "src": "http://localhost:8787/images/symbols/willpower.svg" }
    }
  },
  "cards": [
    {
      "id": "ariel - spectacular singer",
      "image": "http://localhost:8787/images/card-front/0002.jpg",
      "overlays": [
        { "type": "image", "style": "glimmer", "image": "http://localhost:8787/images/overlays/amber-glimmer.png" },
        { "type": "text", "style": "name",   "content": "Ariel" },
        { "type": "text", "style": "title",  "content": "Makalös sångerska" },
        { "type": "text", "style": "traits", "content": "Sagofödd • Hjälte • Prinsessa" },
        { "type": "text", "style": "text", "content": [
          "{t keyword Sångare} 5 {t reminder (Denna karaktär räknas som kostnad 5 när den sjunger sånger.)}",
          "{t ability-name Musikalisk debut} När du spelar denna karaktär, titta på de 4 översta korten i din kortlek. Du får visa upp ett sångkort och lägga det i din hand. Lägg resten underst i din kortlek i valfri ordning."
        ]}
      ]
    },
    {
      "id": "ariel - on human legs",
      "image": "http://localhost:8787/images/card-front/0001.jpg",
      "overlays": [
        { "type": "image", "style": "glimmer", "image": "http://localhost:8787/images/overlays/amber-glimmer.png" },
        { "type": "text", "style": "name",   "content": "Ariel" },
        { "type": "text", "style": "title",  "content": "På mänskliga ben" },
        { "type": "text", "style": "traits", "content": "Sagofödd • Hjälte • Prinsessa" },
        { "type": "text", "style": "text", "content": [
          "{t ability-name Stum} Denna karaktär kan inte {abbr exert} för att sjunga sånger."
        ]}
      ]
    }
  ]
}
```

## Build steps

1. Author `db-type-html-print.json` (all cards migrated to typed overlays + abbreviations).
2. Types: `Card`, `Overlay`, `Abbreviation`, `DB` as above.
3. `parseMarkup(content, abbreviations)` → typed node list: scan `{`…`}` (respect `\}`),
   split function + args, dispatch `t` / `abbr`, plain runs become text nodes.
4. `<Overlay>` component switches on `type`: `image` → `<img>`; `text` → styled container with
   `content` mapped to `<p>`s built from `parseMarkup`; `shape` → styled empty element.
5. Renderer stacks base `image` then `overlays` in array order. **No `innerHTML`.**
6. Point the printer at the new DB; add `keyword` / `reminder` / `ability-name` classes to the CSS copy.

## Deferred / open

- **Nesting** inside `{t …}` (e.g. an `{abbr}` inside a span) — parser can support via recursive
  brace matching; not required by current data.
- **Double braces** `{{ }}` — safer against literal-brace collisions, but heavier; staying single.
- **Shape primitive** — schema is ready; no card uses it yet.
- Recursive abbreviation expansion (text abbreviation containing markup) — leaf-only for now.
