/* @refresh reload */
import { render } from "solid-js/web"

// 4th printer: Typst (typst.ts WASM). We generate Typst markup from the DB and let
// the engine own all layout (wrapping, placement, boxes) — maximal delegation, the
// opposite of the svg-printer's hand-rolled layout. One compile yields BOTH outputs:
// SVG for a live, vector preview injected into the DOM, and PDF for the print
// artifact. Same engine + same source → preview == artifact by construction (no
// two-emitter drift). Deterministic across browsers (one WASM engine).
//
// Trade vs the CanvasKit printer: markup-driven + a compile step + Typst's language,
// but print-native vector output and the cleanest preview/print parity.
//
// Scaffold only — real implementation to come.

const root = document.getElementById("root")

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error("Root element not found in typst-print.html")
}

render(() => <main>typst-printer entry — scaffold</main>, root!)
