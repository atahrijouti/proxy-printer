/* @refresh reload */
import { render } from "solid-js/web"
import { createEffect, createSignal, Show, type Component } from "solid-js"

import "./index.css"
import { composeDocument, type ImagePath } from "./compose"
import { cardBacks, selectFromDeck } from "./deck"
import { compilePdf, compileSvg, configureTypst, loadImages } from "./typst"
import type { DB } from "./types"

const DEFAULT_URL = "http://localhost:8787/db-typst-print.json"

type Loaded = { db: DB; imagePath: ImagePath }

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

const App: Component = () => {
  const [dbUrl, setDbUrl] = createSignal(DEFAULT_URL)
  const [deck, setDeck] = createSignal("")
  const [isCardBack, setIsCardBack] = createSignal(false)

  const [loaded, setLoaded] = createSignal<Loaded | null>(null)
  const [source, setSource] = createSignal("")
  const [svg, setSvg] = createSignal("")
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
        await configureTypst(db.presentation.fonts)
        setStatus("Mapping images…")
        const paths = await loadImages(imageUrls(db))
        const imagePath: ImagePath = (src) => {
          const path = paths.get(src)
          if (!path) throw new Error(`image not loaded: ${src}`)
          return path
        }
        setLoaded({ db, imagePath })
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error))
      }
    })()
  })

  createEffect(() => {
    const current = loaded()
    if (!current) return
    const cards = isCardBack() ? cardBacks(current.db) : selectFromDeck(current.db.cards, deck())
    const doc = composeDocument(cards, current.db.presentation, current.imagePath)
    setSource(doc)
    setStatus("Compiling…")
    ;(async () => {
      try {
        setSvg(await compileSvg(doc))
        setStatus("")
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error))
      }
    })()
  })

  async function downloadPdf() {
    const doc = source()
    if (!doc) return
    const bytes = await compilePdf(doc)
    const blob = new Blob([bytes.slice().buffer], { type: "application/pdf" })
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
        <button onClick={downloadPdf} disabled={!source()}>
          Download PDF
        </button>
        <Show when={status()}>
          <div class="msg">{status()}</div>
        </Show>
      </aside>
      <main>
        <div class="preview" innerHTML={svg()} />
      </main>
    </>
  )
}

const root = document.getElementById("root")

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error("Root element not found in typst-print.html")
}

render(() => <App />, root!)
