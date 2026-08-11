/* @refresh reload */
import { render } from "solid-js/web"
import { createEffect, createMemo, createSignal, For, Show, type Component } from "solid-js"

import "./styles.css"
import { roundedRectPath } from "./draw"
import { FontBook } from "./fonts"
import { composeCard, type CardDraw } from "./layout"
import { exportCardsToPdf } from "./pdf"
import type { Card, DB } from "./types"

const DEFAULT_URL = "http://localhost:8787/db-sv-svg-print.json"

const CardSvg: Component<{ draw: CardDraw; index: number }> = (props) => {
  const clipId = () => `card-clip-${props.index}`
  return (
    <svg
      class="card-svg"
      width={`${props.draw.widthInMm}mm`}
      height={`${props.draw.heightInMm}mm`}
      viewBox={`0 0 ${props.draw.widthInMm} ${props.draw.heightInMm}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id={clipId()}>
          <rect
            x="0"
            y="0"
            width={props.draw.widthInMm}
            height={props.draw.heightInMm}
            rx={props.draw.cornerRadiusInMm}
          />
        </clipPath>
      </defs>

      <g clip-path={`url(#${clipId()})`}>
        <For each={props.draw.artLayers}>
          {(image) => (
            <image href={image.href} x={image.x} y={image.y} width={image.width} height={image.height} />
          )}
        </For>
      </g>

      <For each={props.draw.backgrounds}>
        {(box) => (
          <path
            d={roundedRectPath(box.width, box.height, box.corners)}
            transform={`translate(${box.x} ${box.y})`}
            fill={box.fill}
          />
        )}
      </For>

      <For each={props.draw.symbols}>
        {(image) => (
          <image href={image.href} x={image.x} y={image.y} width={image.width} height={image.height} />
        )}
      </For>

      <For each={props.draw.textFragments}>
        {(fragment) => (
          <text
            x={fragment.x}
            y={fragment.baseline}
            font-family={fragment.fontFamily}
            font-weight={fragment.fontWeight}
            font-style={fragment.fontStyle}
            font-size={String(fragment.fontSizeInMm)}
            letter-spacing={String(fragment.letterSpacingInMm)}
            style={{ "font-kerning": "none", "font-variant-ligatures": "none" }}
            fill={fragment.fill}
            opacity={fragment.opacity}
          >
            {fragment.text}
          </text>
        )}
      </For>
    </svg>
  )
}

const App: Component = () => {
  const [dbUrl, setDbUrl] = createSignal(DEFAULT_URL)
  const [state, setState] = createSignal<{ db: DB; fonts: FontBook } | null>(null)
  const [error, setError] = createSignal<string>()

  createEffect(() => {
    const url = dbUrl()
    setState(null)
    setError(undefined)
    ;(async () => {
      try {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`DB fetch failed (${response.status})`)
        const db = (await response.json()) as DB
        const fonts = new FontBook()
        await fonts.load(db.presentation.fonts)
        setState({ db, fonts })
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : String(loadError))
      }
    })()
  })

  const cards = createMemo(() => {
    const loaded = state()
    if (!loaded) return []
    const drawn: { card: Card; draw: CardDraw }[] = []
    for (const card of loaded.db.cards) {
      try {
        drawn.push({ card, draw: composeCard(card, loaded.db.presentation, loaded.fonts) })
      } catch (composeError) {
        setError(`card "${card.id}": ${composeError instanceof Error ? composeError.message : String(composeError)}`)
      }
    }
    return drawn
  })

  async function downloadPdf() {
    const loaded = state()
    if (!loaded) return
    const draws = cards().map((entry) => entry.draw)
    const blob = await exportCardsToPdf(draws, loaded.fonts)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "proxies.pdf"
    anchor.click()
    // Defer revoke so the browser has started the download before the blob is freed.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  return (
    <>
      <aside class="controls no-print">
        <input type="text" value={dbUrl()} onInput={(event) => setDbUrl(event.currentTarget.value)} />
        <button onClick={downloadPdf} disabled={!state()}>
          Download PDF
        </button>
        <Show when={error()}>
          <div class="msg">{error()}</div>
        </Show>
        <Show when={!state() && !error()}>
          <div class="msg" style={{ color: "#555" }}>
            Loading…
          </div>
        </Show>
      </aside>

      <main>
        <div class="page">
          <For each={cards()}>{(entry, index) => <CardSvg draw={entry.draw} index={index()} />}</For>
        </div>
      </main>
    </>
  )
}

const root = document.getElementById("root")

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error("Root element not found in svg-print.html")
}

render(() => <App />, root!)
