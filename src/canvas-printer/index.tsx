/* @refresh reload */
import { render } from "solid-js/web"

// 3rd printer: CanvasKit (Skia compiled to WASM). Chosen because it brings its OWN
// deterministic rasterizer (same pixels across browsers — NOT the browser's Canvas
// 2D, which varies) AND its own layout engine (SkParagraph: wrapping, styled runs,
// inline image placeholders, per-run backgrounds). So it composites base card + frame
// overlays + styled/positioned text without us owning a layout engine. Raster output
// (fine here); ~3MB WASM (negligible next to the card-image payload). Can render off
// the main thread via OffscreenCanvas in a worker.
//
// Scaffold only — real implementation to come.

const root = document.getElementById("root")

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error("Root element not found in canvas-print.html")
}

render(() => <main>canvas-printer (CanvasKit) entry — scaffold</main>, root!)
