/* @refresh reload */
import { render } from "solid-js/web"
import { createEffect, createSignal, For, Show, type Component } from "solid-js"

import "./index.css"
import { CARD_HEIGHT_MM, CARD_WIDTH_MM } from "./card"
import { cardBacks, selectFromDeck } from "./deck"
import { buildPdf } from "./pdf"
import { CanvasMeasurer, drawCard } from "./render"
import { loadFonts, loadImages } from "./resources"
import type { Card, DB } from "./types"

const DEFAULT_URL = "http://localhost:8787/db-canvas2d-print.json"
const SCALE = 8
const PDF_SCALE = 12
const REVOKE_DELAY_MS = 10_000

interface Loaded {
  db: DB
  images: Map<string, HTMLImageElement>
  measurer: CanvasMeasurer
}

function imageUrls(db: DB): string[] {
  const urls: string[] = []
  if (db.cardBack) urls.push(db.cardBack)
  for (const card of db.cards) {
    urls.push(card.image)
    for (const overlay of card.overlays ?? []) if (overlay.type === "image") urls.push(overlay.src)
  }
  urls.push(...Object.values(db.presentation.abbreviations))
  return [...new Set(urls)]
}

// double-buffered: draw the card to an offscreen canvas, then blit to the target
function renderCard(card: Card, loaded: Loaded, scale: number): HTMLCanvasElement {
  const offscreen = document.createElement("canvas")
  offscreen.width = CARD_WIDTH_MM * scale
  offscreen.height = CARD_HEIGHT_MM * scale
  const ctx = offscreen.getContext("2d")!
  drawCard(ctx, card, loaded.db.presentation, loaded.images, loaded.measurer, scale)
  return offscreen
}

const App: Component = () => {
  const [dbUrl, setDbUrl] = createSignal(DEFAULT_URL)
  const [deck, setDeck] = createSignal("")
  const [isCardBack, setIsCardBack] = createSignal(false)
  const [loaded, setLoaded] = createSignal<Loaded | null>(null)
  const [status, setStatus] = createSignal("Loading…")

  createEffect(() => {
    const url = dbUrl()
    setLoaded(null)
    setStatus("Loading…")
    ;(async () => {
      try {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`DB fetch failed (${response.status})`)
        const db = (await response.json()) as DB
        setStatus("Loading fonts + images…")
        await loadFonts(db.presentation.fonts)
        const images = await loadImages(imageUrls(db))
        setLoaded({ db, images, measurer: new CanvasMeasurer(images) })
        setStatus("")
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error))
      }
    })()
  })

  const cards = () => {
    const current = loaded()
    if (!current) return []
    return isCardBack() ? cardBacks(current.db) : selectFromDeck(current.db.cards, deck())
  }

  async function downloadPdf() {
    const current = loaded()
    if (!current) return
    const urls = cards().map((card) => renderCard(card, current, PDF_SCALE).toDataURL("image/png"))
    const blob = await buildPdf(urls)
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
        <button onClick={downloadPdf} disabled={!loaded()}>
          Download PDF
        </button>
        <Show when={status()}>
          <div class="msg">{status()}</div>
        </Show>
      </aside>
      <main>
        <div class="page">
          <For each={cards()}>
            {(card) => {
              let el!: HTMLCanvasElement
              createEffect(() => {
                const current = loaded()
                if (!current) return
                el.width = CARD_WIDTH_MM * SCALE
                el.height = CARD_HEIGHT_MM * SCALE
                el.getContext("2d")!.drawImage(renderCard(card, current, SCALE), 0, 0)
              })
              return <canvas ref={el} class="card" />
            }}
          </For>
        </div>
      </main>
    </>
  )
}

const root = document.getElementById("root")

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error("Root element not found in canvas2d-print.html")
}

render(() => <App />, root!)
