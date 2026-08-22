import { createMemo, createResource, createSignal, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import {
  buildPdf,
  fetchDb,
  prepareDb,
  renderCard,
  selectCards,
  type PreparedDb,
  type RenderedCard,
  type Selection,
} from "~/printer"
import { createDebounced } from "~/utils/debounce"
import { downloadBlob } from "~/utils/download"

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

export interface Printer {
  settings: Settings
  setSettings: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  status: Accessor<string>
  ready: Accessor<boolean>
  building: Accessor<boolean>
  renderedCards: Accessor<RenderedCard[]>
  downloadPdf: () => Promise<void>
}

const messageFromError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export function createPrinter(): Printer {
  const [settings, setSettings] = createStore<Settings>({
    dbUrl: DEFAULT_URL,
    deck: DEFAULT_DECK,
    cardBacks: false,
  })
  const [building, setBuilding] = createSignal(false)
  const [buildError, setBuildError] = createSignal("")

  const dbUrl = createDebounced(() => settings.dbUrl, DB_URL_DEBOUNCE_MS)
  const deck = createDebounced(() => settings.deck, DECK_DEBOUNCE_MS)
  const [resource] = createResource(dbUrl, async (value) => prepareDb(await fetchDb(value)))

  const preparedDb = (): PreparedDb | undefined =>
    resource.state === "ready" ? resource() : undefined

  const selection = (): Selection =>
    settings.cardBacks ? { kind: "backs" } : { kind: "deck", deck: deck() }

  const renderCache = createMemo(() => {
    preparedDb()
    return new Map<string, RenderedCard>()
  })

  const renderedCards = createMemo<RenderedCard[]>(() => {
    const db = preparedDb()
    if (!db) return []
    const cache = renderCache()
    return selectCards(db.cards, db.cardBack, selection()).map((card) => {
      const cached = cache.get(card.id)
      if (cached) return cached
      const rendered = renderCard(db, card)
      cache.set(card.id, rendered)
      return rendered
    })
  })

  const ready = () => preparedDb() !== undefined

  const status = () => {
    if (resource.loading) return "Loading…"
    const error: unknown = resource.error
    if (error) return messageFromError(error)
    return buildError()
  }

  async function downloadPdf(): Promise<void> {
    setBuilding(true)
    setBuildError("")
    try {
      downloadBlob(await buildPdf(renderedCards().map((card) => card.layers)), FILE_NAME)
    } catch (error) {
      setBuildError(messageFromError(error))
    } finally {
      setBuilding(false)
    }
  }

  return { settings, setSettings, status, ready, building, renderedCards, downloadPdf }
}
