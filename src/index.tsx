/* @refresh reload */
import { render } from "solid-js/web"
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
  type Accessor,
  type Component,
} from "solid-js"

import "./index.css"
import { loadResources, type RenderContext } from "./resources"
import { cardBacks, selectFromDeck } from "./deck"
import { buildPdf } from "./pdf"
import { cardLayers } from "./render"
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
const TEXT_SCALE = 16
const REVOKE_DELAY_MS = 10_000
const DB_URL_DEBOUNCE_MS = 500
const DECK_DEBOUNCE_MS = 300

function symbolUrls(db: DB): string[] {
  return [...new Set(Object.values(db.symbols ?? {}))]
}

function debounced<T>(source: Accessor<T>, delayMs: number): Accessor<T> {
  const [value, setValue] = createSignal(source())
  createEffect(() => {
    const next = source()
    const timer = setTimeout(() => setValue(() => next), delayMs)
    onCleanup(() => clearTimeout(timer))
  })
  return value
}

const App: Component = () => {
  const [dbUrl, setDbUrl] = createSignal(DEFAULT_URL)
  const [deck, setDeck] = createSignal(DEFAULT_DECK)
  const [isCardBack, setIsCardBack] = createSignal(false)
  const [ctx, setCtx] = createSignal<RenderContext | null>(null)
  const [db, setDb] = createSignal<DB | null>(null)
  const [status, setStatus] = createSignal("Loading…")
  const dbUrlSettled = debounced(dbUrl, DB_URL_DEBOUNCE_MS)
  const deckSettled = debounced(deck, DECK_DEBOUNCE_MS)

  createEffect(() => {
    const url = dbUrlSettled()
    setCtx(null)
    setDb(null)
    setStatus("Loading…")
    ;(async () => {
      try {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`DB fetch failed (${response.status})`)
        const database = (await response.json()) as DB
        setStatus("Loading resources…")
        const styles = database.presentation?.styles ?? {}
        const resources = await loadResources(
          database.presentation?.fonts ?? [],
          symbolUrls(database),
        )
        setCtx({
          ...resources,
          styles,
          symbols: database.symbols ?? {},
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
    return isCardBack() ? cardBacks(database) : selectFromDeck(database.cards, deckSettled())
  }

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
if (!(root instanceof HTMLElement)) {
  throw new Error("Root element not found in skia-canvas-kit-print.html")
}

render(() => <App />, root)
