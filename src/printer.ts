import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  type Accessor,
} from "solid-js"
import { createStore } from "solid-js/store"
import { cardBacks, selectFromDeck } from "./deck"
import { downloadBlob } from "./download"
import { buildPdf } from "./pdf"
import { cardLayers, type Layer } from "./render"
import { loadResources, type RenderContext } from "./resources"
import type { Card, DB } from "./types"

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
const DB_URL_DEBOUNCE_MS = 500
const DECK_DEBOUNCE_MS = 300
const FILE_NAME = "proxies.pdf"

export interface Settings {
  dbUrl: string
  deck: string
  cardBacks: boolean
}

export interface RenderedCard {
  id: string
  layers: Layer[]
}

interface Data {
  cards: Card[]
  cardBack?: string
  ctx: RenderContext
  rendered: Map<string, RenderedCard>
}

const toMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

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

async function fetchDb(url: string): Promise<DB> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`DB fetch failed (${response.status})`)
  return (await response.json()) as DB
}

async function prepareData(db: DB): Promise<Data> {
  const resources = await loadResources(db.presentation?.fonts ?? [], symbolUrls(db))
  return {
    cards: db.cards,
    cardBack: db.cardBack,
    ctx: {
      ...resources,
      styles: db.presentation?.styles ?? {},
      symbols: db.symbols ?? {},
      scale: TEXT_SCALE,
    },
    rendered: new Map(),
  }
}

export function createPrinter() {
  const [settings, setSettings] = createStore<Settings>({
    dbUrl: DEFAULT_URL,
    deck: DEFAULT_DECK,
    cardBacks: false,
  })
  const [building, setBuilding] = createSignal(false)
  const [buildError, setBuildError] = createSignal("")

  const urlSettled = debounced(() => settings.dbUrl, DB_URL_DEBOUNCE_MS)
  const deckSettled = debounced(() => settings.deck, DECK_DEBOUNCE_MS)
  const [resource] = createResource(urlSettled, async (url) => prepareData(await fetchDb(url)))

  const resourceData = (): Data | undefined => (resource.state === "ready" ? resource() : undefined)

  const cards = (): Card[] => {
    const data = resourceData()
    if (!data) return []
    return settings.cardBacks ? cardBacks(data.cardBack) : selectFromDeck(data.cards, deckSettled())
  }

  const renderedCards = createMemo<RenderedCard[]>(() => {
    const data = resourceData()
    if (!data) return []
    return cards().map((card) => {
      const cached = data.rendered.get(card.id)
      if (cached) return cached
      const rendered: RenderedCard = { id: card.id, layers: cardLayers(data.ctx, card) }
      data.rendered.set(card.id, rendered)
      return rendered
    })
  })

  const ready = () => resourceData() !== undefined

  const status = () => {
    if (resource.loading) return "Loading…"
    const error: unknown = resource.error
    if (error) return toMessage(error)
    return buildError()
  }

  const toPdf = (): Promise<Blob> => buildPdf(renderedCards().map((card) => card.layers))

  async function downloadPdf(): Promise<void> {
    setBuilding(true)
    setBuildError("")
    try {
      downloadBlob(await toPdf(), FILE_NAME)
    } catch (error) {
      setBuildError(toMessage(error))
    } finally {
      setBuilding(false)
    }
  }

  return { settings, setSettings, status, ready, building, renderedCards, downloadPdf }
}

export type Printer = ReturnType<typeof createPrinter>
