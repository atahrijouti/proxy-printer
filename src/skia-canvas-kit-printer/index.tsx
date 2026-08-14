/* @refresh reload */
import { render } from "solid-js/web"
import { createEffect, createMemo, createSignal, For, Show, type Component } from "solid-js"

import "./index.css"
import { loadEngine } from "./engine"
import { cardBacks, selectFromDeck } from "./deck"
import { buildPdf } from "./pdf"
import { cardLayers, type RenderContext } from "./render"
import type { DB } from "./types"

const DEFAULT_URL = "http://localhost:8787/db-sv-print.json"
const TEXT_SCALE = 16 // px per mm for rasterizing text layers; the card art stays native
const REVOKE_DELAY_MS = 10_000

// canvaskit only draws the {abbr} symbols into text layers; all card art renders as native <img>
function symbolUrls(db: DB): string[] {
  return [...new Set(Object.values(db.presentation.abbreviations))]
}

const App: Component = () => {
  const [dbUrl, setDbUrl] = createSignal(DEFAULT_URL)
  const [deck, setDeck] = createSignal("")
  const [isCardBack, setIsCardBack] = createSignal(false)
  const [ctx, setCtx] = createSignal<RenderContext | null>(null)
  const [db, setDb] = createSignal<DB | null>(null)
  const [status, setStatus] = createSignal("Loading…")

  createEffect(() => {
    const url = dbUrl()
    setCtx(null)
    setDb(null)
    setStatus("Loading…")
    ;(async () => {
      try {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`DB fetch failed (${response.status})`)
        const database = (await response.json()) as DB
        setStatus("Loading engine…")
        const engine = await loadEngine(database.presentation.fonts, symbolUrls(database))
        setCtx({
          ...engine,
          styles: database.presentation.styles,
          abbreviations: database.presentation.abbreviations,
          scale: TEXT_SCALE,
        })
        setDb(database)
        setStatus("")
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error))
      }
    })()
  })

  const cards = () => {
    const database = db()
    if (!database) return []
    return isCardBack() ? cardBacks(database) : selectFromDeck(database.cards, deck())
  }

  // text layers are rasterized once by canvaskit; the art is native <img> — shared by screen + PDF
  const deckLayers = createMemo(() => {
    const context = ctx()
    if (!context) return []
    return cards().map((card) => cardLayers(context, card))
  })

  async function downloadPdf() {
    const blob = await buildPdf(deckLayers())
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = href
    anchor.download = "proxies.pdf"
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(href), REVOKE_DELAY_MS)
  }

  return (
    <>
      <aside class="controls no-print">
        <input
          type="text"
          value={dbUrl()}
          onInput={(event) => setDbUrl(event.currentTarget.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={isCardBack()}
            onChange={() => setIsCardBack(!isCardBack())}
          />
          Card backs
        </label>
        <textarea
          class="deck"
          placeholder="1 card id per line — blank prints all"
          value={deck()}
          onInput={(event) => setDeck(event.currentTarget.value)}
          disabled={isCardBack()}
        />
        <button onClick={downloadPdf} disabled={!ctx()}>
          Download PDF
        </button>
        <Show when={status()}>
          <div class="msg">{status()}</div>
        </Show>
      </aside>
      <main>
        <div class="page">
          <For each={deckLayers()}>
            {(layers) => (
              <div class="card">
                <For each={layers}>{(layer) => <img class="layer" src={layer.src} alt="" />}</For>
              </div>
            )}
          </For>
        </div>
      </main>
    </>
  )
}

const root = document.getElementById("root")

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error("Root element not found in skia-canvas-kit-print.html")
}

render(() => <App />, root!)
