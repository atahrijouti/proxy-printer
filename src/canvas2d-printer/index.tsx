/* @refresh reload */
import { render } from "solid-js/web"
import { createEffect, createMemo, createSignal, For, Show, type Component } from "solid-js"

import "./index.css"
import { cardBacks, selectFromDeck } from "./deck"
import { buildPdf } from "./pdf"
import { cardLayers } from "./render"
import { resolveDb } from "./resolve"
import { loadFonts, loadImages } from "./resources"
import type { DB } from "./types"

const DEFAULT_URL = "http://localhost:8787/db-sv-print.json"

const DEFAULT_DECK = `1 tinker bell - giant fairy
1 genie - powers unleashed
1 donald duck - musketeer
1 goofy - musketeer
1 maximus - palace horse
1 ariel - spectacular singer
1 captain hook - thinking a happy thought
1 aladdin - heroic outlaw
1 jasmine - queen of agrabah`
const TEXT_SCALE = 16 // px per mm for rasterizing text layers; the art stays native
const REVOKE_DELAY_MS = 10_000

interface RenderData {
  db: DB
  images: Map<string, HTMLImageElement>
}

// only the {sym} symbols get drawn onto a canvas; base + overlay art render as native <img>
function symbolUrls(db: DB): string[] {
  return [...new Set(Object.values(db.symbols ?? {}))]
}

const App: Component = () => {
  const [dbUrl, setDbUrl] = createSignal(DEFAULT_URL)
  const [deck, setDeck] = createSignal(DEFAULT_DECK)
  const [isCardBack, setIsCardBack] = createSignal(false)
  const [renderData, setRenderData] = createSignal<RenderData | null>(null)
  const [status, setStatus] = createSignal("Loading…")

  createEffect(() => {
    const url = dbUrl()
    setRenderData(null)
    setStatus("Loading…")
    ;(async () => {
      try {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`DB fetch failed (${response.status})`)
        const db = (await response.json()) as DB
        setStatus("Loading fonts + symbols…")
        await loadFonts(db.presentation?.fonts ?? [])
        const images = await loadImages(symbolUrls(db))
        setRenderData({ db, images })
        setStatus("")
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error))
      }
    })()
  })

  const cards = () => {
    const data = renderData()
    if (!data) return []
    return isCardBack() ? cardBacks(data.db) : selectFromDeck(data.db.cards, deck())
  }

  // resolve the DB's registries once at text scale; text layers are scale-fixed and shared by screen + PDF
  const resolved = createMemo(() => {
    const data = renderData()
    return data ? resolveDb(data.db, TEXT_SCALE) : null
  })

  const deckLayers = createMemo(() => {
    const data = renderData()
    const db = resolved()
    if (!data || !db) return []
    return cards().map((card) => cardLayers(card, db, data.images, TEXT_SCALE))
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
        <button onClick={downloadPdf} disabled={!renderData()}>
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
if (!(root instanceof HTMLElement)) {
  throw new Error("Root element not found in canvas2d-print.html")
}

render(() => <App />, root)
