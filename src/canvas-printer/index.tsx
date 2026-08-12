/* @refresh reload */
import { render } from "solid-js/web"
import { createEffect, createSignal, For, Show, type Component } from "solid-js"

import "./index.css"
import { loadEngine, type Engine } from "./engine"
import { cardBacks, selectFromDeck } from "./deck"
import { buildPdf } from "./pdf"
import {
  CARD_HEIGHT_MM,
  CARD_WIDTH_MM,
  renderCard,
  renderCardPng,
  type RenderContext,
} from "./render"
import type { Card, DB } from "./types"

const DEFAULT_URL = "http://localhost:8787/db-canvas-print.json"
const SCALE = 8
const PDF_SCALE = 12

function imageUrls(db: DB): string[] {
  const urls: string[] = []
  if (db.cardBack) urls.push(db.cardBack)
  for (const card of db.cards) {
    urls.push(card.image)
    for (const overlay of card.overlays ?? []) if (overlay.type === "image") urls.push(overlay.src)
  }
  for (const abbr of Object.values(db.presentation.abbreviations)) {
    if (abbr.type === "image") urls.push(abbr.src)
  }
  return [...new Set(urls)]
}

function paint(canvas: HTMLCanvasElement, ctx: RenderContext, card: Card) {
  const width = CARD_WIDTH_MM * ctx.scale
  const height = CARD_HEIGHT_MM * ctx.scale
  const surface = ctx.ck.MakeSurface(width, height)
  if (!surface) return
  const skCanvas = surface.getCanvas()
  skCanvas.clear(ctx.ck.TRANSPARENT)
  try {
    renderCard(skCanvas, ctx, card)
  } catch (error) {
    console.error("renderCard failed:", error)
    surface.delete()
    return
  }
  surface.flush()

  const image = surface.makeImageSnapshot()
  const pixels = image.readPixels(0, 0, {
    width,
    height,
    colorType: ctx.ck.ColorType.RGBA_8888,
    alphaType: ctx.ck.AlphaType.Unpremul,
    colorSpace: ctx.ck.ColorSpace.SRGB,
  }) as Uint8Array
  const context = canvas.getContext("2d")
  if (context)
    context.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0)
  image.delete()
  surface.delete()
}

const App: Component = () => {
  const [dbUrl, setDbUrl] = createSignal(DEFAULT_URL)
  const [deck, setDeck] = createSignal("")
  const [isCardBack, setIsCardBack] = createSignal(false)
  const [state, setState] = createSignal<{ db: DB; ctx: RenderContext } | null>(null)
  const [status, setStatus] = createSignal("Loading…")

  createEffect(() => {
    const url = dbUrl()
    setState(null)
    setStatus("Loading…")
    ;(async () => {
      try {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`DB fetch failed (${response.status})`)
        const db = (await response.json()) as DB
        setStatus("Loading engine…")
        const engine: Engine = await loadEngine(db.presentation.fonts, imageUrls(db))
        const ctx: RenderContext = {
          ...engine,
          styles: db.presentation.styles,
          abbreviations: db.presentation.abbreviations,
          scale: SCALE,
        }
        setState({ db, ctx })
        setStatus("")
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error))
      }
    })()
  })

  const cards = () => {
    const current = state()
    if (!current) return []
    return isCardBack() ? cardBacks(current.db) : selectFromDeck(current.db.cards, deck())
  }

  async function downloadPdf() {
    const current = state()
    if (!current) return
    const pngs = cards().map((card) => renderCardPng(current.ctx, card, PDF_SCALE))
    const blob = await buildPdf(pngs)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "proxies.pdf"
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
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
        <button onClick={downloadPdf} disabled={!state()}>
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
                const current = state()
                if (current) paint(el, current.ctx, card)
              })
              return (
                <canvas
                  ref={el}
                  class="card"
                  width={CARD_WIDTH_MM * SCALE}
                  height={CARD_HEIGHT_MM * SCALE}
                />
              )
            }}
          </For>
        </div>
      </main>
    </>
  )
}

const root = document.getElementById("root")

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error("Root element not found in canvas-print.html")
}

render(() => <App />, root!)
