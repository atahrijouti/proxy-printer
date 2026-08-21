import { createMemo, createResource, createSignal, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import { fetchDb, prepareDb, type PreparedDb } from "./db"
import { cardBacks, selectFromDeck } from "./deck"
import { debounced } from "../utils/debounce"
import { downloadBlob } from "../utils/download"
import { CARDS_PER_PAGE } from "./page"
import { buildPdf } from "./pdf"
import { cardLayers, type Layer } from "./render"
import type { Card } from "./types"

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

export interface Printer {
  settings: Settings
  setSettings: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  status: Accessor<string>
  ready: Accessor<boolean>
  building: Accessor<boolean>
  renderedCards: Accessor<RenderedCard[]>
  downloadPdf: () => Promise<void>
}

const toMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export function createPrinter(): Printer {
  const [settings, setSettings] = createStore<Settings>({
    dbUrl: DEFAULT_URL,
    deck: DEFAULT_DECK,
    cardBacks: false,
  })
  const [building, setBuilding] = createSignal(false)
  const [buildError, setBuildError] = createSignal("")

  const dbUrl = debounced(() => settings.dbUrl, DB_URL_DEBOUNCE_MS)
  const deck = debounced(() => settings.deck, DECK_DEBOUNCE_MS)
  const [resource] = createResource(dbUrl, async (value) => prepareDb(await fetchDb(value)))

  const preparedDb = (): PreparedDb | undefined =>
    resource.state === "ready" ? resource() : undefined

  const cards = (db: PreparedDb): Card[] =>
    settings.cardBacks ? cardBacks(db.cardBack, CARDS_PER_PAGE) : selectFromDeck(db.cards, deck())

  const renderCache = createMemo(() => {
    preparedDb()
    return new Map<string, RenderedCard>()
  })

  const renderedCards = createMemo<RenderedCard[]>(() => {
    const db = preparedDb()
    if (!db) return []
    const cache = renderCache()
    return cards(db).map((card) => {
      const cached = cache.get(card.id)
      if (cached) return cached
      const rendered: RenderedCard = {
        id: card.id,
        layers: cardLayers(db.resources, db.styles, db.symbols, card),
      }
      cache.set(card.id, rendered)
      return rendered
    })
  })

  const ready = () => preparedDb() !== undefined

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
