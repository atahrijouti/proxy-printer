# Proxy Printer — Goal

> The target for a printer backend. Each printer is its own self-contained backend
> (one per approach, kept separate); this describes a single printer, not a shared
> engine. Footnotes below record where earlier printers diverge and why.

## The model

The printer renders a print run assembled from two inputs: a **DB** — a catalog of
card definitions plus the presentation that drives how they look — and a **decklist**
that selects which cards, and how many copies, to print. A card needs only an `id` and
a base `image`; everything else is optional. To overlay, a card carries an ordered
list of overlays stacked on the image in the order given (the provider owns stacking
and placement), each one of three primitives: an **image** (layered on), a **shape** (a
content-less primitive whose form, size, and position come entirely from its named
style), or **text**. Text is plain by default but supports two inline mechanisms, each
keyed by a provider-chosen name: **tagged runs** (a stretch of text that picks up a
named style) and **substitutions** (a token replaced by registered content, most
notably inline symbols). All styling — where each thing sits and how it looks — is
**supplied by the DB and applied by the printer, never hardcoded**; the printer
interprets no meaning (_name_, _ability_, _trait_ are nothing to it), it only applies
the named styles and substitutions it's handed.

## The guarantee and output

The one hard requirement: the deliverable is identical for the same input, regardless
of the browser or OS running the printer. So the printer renders through a
self-contained, controlled pipeline with fonts supplied by the DB — it never defers
layout, text flow, or glyph rendering to the host (the thing that varies) — producing
the same stacking, shapes, wrapping, and glyphs everywhere, fully offline. From that
single render it yields both a live on-screen preview and a print-ready output whose
page geometry — page size, card grid, and margins — is defined by the printer, not the
browser's print dialog, so what you preview is exactly what prints; the run paginates
across pages, with an option to emit matching card backs for double-sided printing.

## Footnotes (divergences from earlier printers)

_To be filled in as we review the goal against the html-printer and svg-printer._
