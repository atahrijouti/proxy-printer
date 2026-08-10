# Rendering & DB Paradigm — Ideation

> **Status: ideation, not committed.** This captures a design direction we talked
> through. The current printer and DB schema are proof-of-concept — they clarified
> the problem space but nothing here is locked. Treat every schema/name below as a
> sketch to argue with.

## The problem we're actually solving

The proof-of-concept renders overlays with HTML/CSS and produces the artifact via
the **browser's print-to-PDF**. That makes the *user's browser* the renderer, and
every engine lays text out slightly differently:

- vertical metrics (ascent/descent/`text-box-trim` support) — mostly tamable, but
  fiddly (see the Safari-vs-Firefox mark-centering saga);
- **line-breaking** — the uncontrollable one. Same text + same box width can break
  at different points in Blink / Gecko / WebKit → different line counts → the whole
  block shifts or overflows. CSS cannot make this identical across engines.

Consequence: whoever authors a DB would have to test on every browser × OS combo to
trust the output. That's the trap we want to escape.

## Goals / constraints

- **All in-browser, offline, no server.** Must work air-gapped; users feel safe.
- **Deterministic heights / layout.** A DB renders identically today and next year,
  on any machine → reproducible.
- **Preview == artifact.** No separate "print CSS" path that can drift from preview.
- **DB does not ship raw HTML.** Safer, and keeps rendering fully under our control.
- **Lean authoring.** Text fields are simple strings with light inline markup — not
  verbose JSON ASTs.

## Core idea: stop letting the browser lay out text

The escape from the trap is one principle: **we own text layout, in the browser.**
The browser becomes a JS/WASM runtime; the output is identical for everyone.

Three layers, each owned by a different party, each independently testable:

1. **Content (the DB `cards`).** Semantic, structured, no geometry/HTML/URLs.
   Authored by deck/set builders. Nothing to cross-browser-test.
2. **Template (`presentation`, authored once per game/layout).** All geometry and
   styling. Tested **once** against the deterministic renderer, not N browsers.
3. **Renderer (deterministic, in-browser).** Consumes content + template, lays out
   text itself, emits one artifact representation used for **both** preview and PDF.

## DB shape (sketch)

Presentation grouped under one key; data under `cards`. Lean fields; plain strings
where no styling is needed.

```jsonc
{
  "name": "Lorcana SV",
  "presentation": {
    "templates": {
      "character": {
        "card": { "w": "63mm", "h": "88mm" },
        "roles": {
          "name":      { "box": {…}, "font": "bystander", "size": "4.75mm", "trim": "cap-alphabetic" },
          "abilities": { "box": {…}, "size": "2.646mm", "lineHeight": 1, "fit": "shrink" }
        }
      }
    },
    "styles": {                       // what {style:X} resolves to
      "keyword":      { "badge": true, "bg": "#5a442c", "color": "#fff", "font": "bogle-black", "uppercase": true },
      "reminder":     { "italic": true },
      "ability-name": { "font": "bogle-black", "uppercase": true }
    },
    "symbols": { "exert": { "asset": "symbols/exert.svg", "height": "0.92em", "baseline": "-0.17em" } },
    "fonts":  [ { "family": "Bogle", "weight": 400, "src": "fonts/BOGLEREGULAR.woff" } ]
  },
  "cards": [
    {
      "template": "character",
      "image": "https://host/images/card-front/0002.jpg",
      "name": "Ariel",
      "version": "Makalös sångerska",
      "traits": "Sagofödd • Hjälte • Prinsessa",
      "abilities": {
        "type": "stacked",
        "content": [
          "{style:keyword}Sångare{/style} 5 {style:reminder}(Denna karaktär räknas som kostnad 5.){/style}",
          "{style:ability-name}Musikalisk debut{/style} …titta på de 4 översta korten {sym:exert}…"
        ]
      }
    }
  ]
}
```

Notes:
- `abilities.type` (`"stacked"` | later `"single"` / `"two-column"` …) is a layout
  hint: the card says *what*, the template says *how*.
- Every text field is "a markup string"; plain text is just the zero-tag case.

## Text markup + parser

**The friendly string is the wire/authoring format; it compiles to internal runs at
load time.** Authors write strings; the renderer consumes structured runs it never
sees written down.

Grammar (tiny, closed):

- `{style:NAME} … {/style}` — styled span. Generic `{/style}` close + a LIFO stack
  handles nesting, so authors don't repeat the name.
- `{sym:NAME}` — inline symbol, self-closing. (`{abrv:…}` if we prefer — keep the tag
  prefix matched to its registry key.)
- Everything else is literal text; `\{` escapes a literal brace.

Compiles to something like:

```ts
type Node =
  | { t: "text"; v: string }
  | { t: "span"; style: string; children: Node[] }
  | { t: "sym";  id: string }
```

**Parser choice (open):**
- *Hand-rolled (~50 lines, zero deps)* — recommended. Closed tag set means an unknown
  `{style:foo}` (not in `presentation.styles`) is a load-time validation error, not a
  silent blank. That validation is cleanest when we own the parser + registries.
- *remark-directive* (unified) — established `:keyword[…]` / `:exert` syntax, but pulls
  in the markdown toolchain and live markdown semantics (more surface area).
- *BBCode* — `[keyword]…[/keyword]`, small libs, closest in spirit to the above.

## Rendering pipeline

One renderer, one output representation → preview and PDF can't diverge.

```
content + template ──▶ [deterministic renderer] ──▶ SVG (the artifact)
                                                       ├─ preview: inject SVG into DOM
                                                       └─ PDF: SVG → svg2pdf.js (vector)
                                                              (or resvg-wasm → PNG)
```

App stack is **Solid.js** — so favor framework-agnostic renderers (or ones with a
Solid-native story). Keep the schema **renderer-agnostic** regardless; the renderer is
an implementation detail behind the template contract. Non-Vercel candidates (we avoid
Vercel tooling):

- **Hand-rolled: `opentype.js` (MIT) + a small line-breaker → SVG.** Max control,
  minimal deps, framework-agnostic. Keeps the elegant "SVG is the single artifact"
  pipeline — and SVG renders **natively and reactively in Solid** (the preview is just
  Solid rendering the SVG nodes; the same SVG → PDF via `svg2pdf.js`, or → PNG via
  `resvg-wasm`, both non-Vercel). *Leading candidate* — best fit for the
  control/determinism/offline goals *and* the Solid stack. Cost: we write the wrapping
  + run-styling ourselves (bounded; cards are tiny).
- **Typst compiled to WASM (`typst.ts`)** — framework-agnostic (call it from Solid,
  hand it markup, get a PDF). Print-grade and fully deterministic, but a new authoring
  language and heavier bundle.
- **`@react-pdf/renderer`** — *poor fit here:* its own deterministic layout engine is
  nice, but it's React-only, so using it from Solid means pulling in a React runtime
  just for PDF. Listed only to record why it's excluded.

Bonus: generating a PDF with our own page geometry sidesteps the Safari "no margins"
print-dialog problem entirely.

### Determinism boundary

Layout (positions + line breaks) is baked by us. The PDF *viewer* still rasterizes
glyphs (hinting/subpixel) — that's fine; it doesn't move anything. Card **art** can be
remote/raster (doesn't affect layout). Only **layout-affecting assets** (fonts, symbol
vectors, style defs) must be local/bundled.

## Images

Each card provides its art as a **full URL** — no derivation from `name`, no
`base + id` templating in the DB. It's the caller's job to supply a complete,
resolvable URL. This sidesteps the whole multi-host / id-scheme can of worms; a card
can point anywhere, and there's no hidden resolution logic to reason about.

Determinism-wise this is fine: art is raster and never affects layout.

## Reproducibility pinning (to make "renders the same in a year" literal)

- DB references `template@version`; template pins **font file hashes** + a schema
  version. Same inputs + pinned template + pinned renderer version = identical output.
- `styles` / `symbols` are **closed sets**; validate DB against them at load →
  unknown tokens fail loudly.

## Open questions / decisions to make

- Renderer: hand-rolled (opentype.js → SVG) vs Typst-WASM. (Lean hand-rolled to
  start — framework-agnostic, SVG is Solid-native. No Vercel; @react-pdf excluded as
  React-only.)
- Parser: hand-rolled vs remark-directive vs BBCode. (Lean hand-rolled.)
- Fit strategy for variable-length text into fixed boxes: deterministic shrink-to-fit
  steps? size buckets in the template? (Replaces today's `.smaller-text` hack.)
- Where do bundled assets live and how are they pinned/verified offline?
- RTL / locale handling (there was an `.rtl` need) — per-block `dir`?
- How much of `presentation` lives in the DB file vs. a separate template file the DB
  references? (Portability vs. single-file convenience.)
- Card-back / non-card pages in the same model?

## Possible first vertical slice (when/if we commit)

1. TS types for the DB shape.
2. The ~50-line markup parser → runs (+ registry validation).
3. Loader: validate styles/symbols.
4. Feed one parsed card (Ariel) through the chosen renderer (e.g. hand-rolled
   `opentype.js` → SVG) and export a PDF — to eyeball preview/artifact parity,
   inline-symbol placement, and the keyword badge before committing further.
