# Proxy Printer — Goal

## What it is

Proxy Printer prints proxy cards. It takes a DB and a deck, renders each card, and
produces a print-ready PDF plus an on-screen preview of the same pages.

The printer is the main feature of this software. Other tools will sit alongside it
later — a DB maker is the one already known. `src/printer/` is that tool's namespace,
not insulation against a swappable rendering backend.

## Inputs

**DB** — a JSON document adhering to `src/db/schema.ts`. Any DB that adheres works; the
printer is not tied to one game. It holds `cards`, plus the `styles`, `fonts` and
`symbols` those cards refer to. That second group has deliberately no umbrella name:
functions take `styles` and `symbols` directly rather than threading a container that
gets in the way.

**Deck** — text, one line per entry: a count followed by a card id. Blank prints every
card in the DB.

## Cards and overlays

A card needs an `id` and a base `image`. Everything drawn on top comes from its ordered
`overlays` array, in painter's order — the first element sits directly on the base
image, each subsequent one above it, the last topmost.

An overlay is one of three kinds:

- **image** — layered on as-is
- **text** — the substantial one
- **shape** — a content-less primitive whose form, size and position come entirely from
  its named style; not implemented yet

In the DB an overlay is a plain object describing what the overlay should be. Once
produced it is the same thing at a later phase: a rasterized image on a transparent
background. One concept in two phases, so the two names share a root rather than
diverging into unrelated words.

## Text

Text is plain by default and supports two inline mechanisms, both keyed by names the DB
chooses: **tagged spans** — a stretch of text that picks up a named style — and
**substitutions** — a token replaced by registered content, currently inline symbols and
extensible to other registered kinds. A named style carries typography, the box to lay
out in, alignment, an optional background and margins. Block text shrinks to fit its box.

The printer interprets no card-domain meaning. *Name*, *ability* and *trait* are nothing
to it; it applies the named styles and substitutions it is handed.

## Rendering

The rendering backend is locked, split by job:

- **CanvasKit** turns text into a rasterized overlay on a transparent background.
- **resvg** turns SVG symbols into rasterized images for CanvasKit to place inline.

Consecutive text overlays on a card rasterize together into one image; an image overlay
passes through as its own layer. The result per card is a stack of images.

## Output

Stacking those images is the easy part, and it is done once per destination: the browser
layers them absolutely for the preview, pdfkit layers them into the PDF. Both are
trusted, and the preview is the working loop.

A page is A4 holding 3×3 cards of 63×88mm at 10mm padding, and a document is a run of
such pages. These are constants.

Card backs produce a single page of nine backs. Making more copies is left to whatever
PDF software the user prints from — deliberately, to avoid going deeper into that
function for now.

PDF creation has not been scrutinized. `pdf.ts` pins the document dates to the epoch,
which would give byte-identical output for identical input, but that is not a verified
guarantee and not currently a concern.

## Phase one

Phase one is locked to the current card size and page layout. The order of work:

1. Improve the code quality of the project as it currently exists, without altering any
   logic. Really done before moving on.
2. Fix bugs, including the ones that need logic changes, and fill what is plainly
   missing from the feature set.
3. Improve the UI.
4. Improve performance.

Deferred to a later phase: **imposition** — how many cards go on a page and which ones,
2×4 or 3×3, card backs beside fronts — along with other card sizes and other page
layouts.
