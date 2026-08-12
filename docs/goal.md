# Proxy Printer — Goal

> The target for a printer backend. Each printer is its own self-contained backend
> (one per approach, kept separate); this describes a single printer, not a shared
> engine. Footnotes below record where earlier printers diverge and why.

## The model

The printer renders a print run assembled from two inputs: a **DB** — a catalog of
card definitions plus the presentation (named styles, fonts, and symbols) that drives
how they look — and a **decklist**
that selects which cards, and how many copies, to print. A card needs only an `id` and
a base `image`; everything else is optional. To fill a card, it carries an ordered
`overlays` array drawn in painter's order — the first element sits directly on the
base image, each subsequent element on top, the last topmost — each one of three
primitives: an **image** (layered on), a **shape** (a content-less primitive whose
form, size, and position come entirely from its named style), or **text**. Text is plain by default but supports two inline mechanisms, each
keyed by a name the **provider** (whoever builds the DB) chooses: **tagged spans** (a
stretch of text that picks up a named style) and **substitutions** (a token replaced
by registered content — currently inline symbols, extensible to other registered
kinds). The printer defines the frame — page size and
margins, each card's size, corner radius, and grid arrangement — and then lets the DB
fill each card's interior. Everything layered inside a card — the overlays and how
each is styled and placed — comes from the DB; the printer interprets no card-domain
meaning (_name_, _ability_, _trait_ are nothing to it), only applying the named styles
and substitutions it's handed.

## The guarantee and output

The one hard requirement: for the same input the printer produces a **byte-identical,
print-ready PDF**, regardless of the browser or OS it ran on. Building the PDF is
**entirely client-side** — there is no server-side computation; the app can be served
locally or from static hosting, and only the client is needed to build the file. It
also shows a live on-screen preview that reflects the PDF. The page layout — page
size, margins, card size, corner radius, and grid — is defined by the printer and
baked into the PDF; the run paginates across pages, and the same tooling can render a
card-back page (the grid filled with the DB's back image).

## Footnotes (divergences from earlier printers)

1. **Determinism.** html-printer renders via the browser's own HTML/CSS + print, so its
   output varies by browser/OS — the divergence that motivated making byte-identical
   output a goal in the first place. (svg-printer builds the PDF itself, so it isn't
   subject to this.)
2. **Painter's order (svg-printer).** svg-printer batches its draw output by category
   (images, then background boxes, then text) instead of one ordered op-list, so overlay
   order is honored only where images precede text — true for every current card, but an
   arbitrary image-over-text interleave wouldn't stack in array order.
