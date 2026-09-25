import {
  type Accessor,
  createContext,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  type JSX,
  onCleanup,
  useContext,
} from "solid-js"
import { createStore } from "solid-js/store"

import { fetchDb } from "~/db/load"
import type { DB } from "~/db/schema"
import {
  buildPdf,
  type Environment,
  type Imposition,
  loadEnvironment,
  renderCard,
  type RenderedCard,
  selectCards,
} from "~/printer"

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
const REVOKE_DELAY_MS = 10_000

export interface Settings {
  dbUrl: string
  deck: string
  cardBacks: boolean
}

interface PrinterResource {
  db: DB
  environment: Environment
  rendered: Map<string, RenderedCard>
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

function createPrinter(): Printer {
  const [settings, setSettings] = createStore<Settings>({
    dbUrl: DEFAULT_URL,
    deck: DEFAULT_DECK,
    cardBacks: false,
  })
  const [building, setBuilding] = createSignal(false)
  const [buildError, setBuildError] = createSignal("")

  const dbUrl = createDebounced(() => settings.dbUrl, DB_URL_DEBOUNCE_MS)
  const deck = createDebounced(() => settings.deck, DECK_DEBOUNCE_MS)
  const [request] = createResource(dbUrl, async (url): Promise<PrinterResource> => {
    const db = await fetchDb(url)
    return { db, environment: await loadEnvironment(db), rendered: new Map() }
  })

  const printerResource = (): PrinterResource | undefined =>
    request.state === "ready" ? request() : undefined

  const imposition = (): Imposition =>
    settings.cardBacks ? { kind: "backs" } : { kind: "deck", deck: deck() }

  const renderedCards = createMemo<RenderedCard[]>(() => {
    const resource = printerResource()
    if (!resource) return []
    const { db, environment, rendered } = resource
    return selectCards(db.cards, db.cardBack, imposition()).map((card) => {
      const cached = rendered.get(card.id)
      if (cached) return cached
      const renderedCard = renderCard(environment, db, card)
      rendered.set(card.id, renderedCard)
      return renderedCard
    })
  })

  const ready = () => printerResource() !== undefined

  const status = () => {
    if (request.loading) return "Loading…"
    const error: unknown = request.error
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

const PrinterContext = createContext<Printer>()

export const PrinterProvider = (props: { children: JSX.Element }) => {
  const printer = createPrinter()

  return <PrinterContext.Provider value={printer}>{props.children}</PrinterContext.Provider>
}

export function usePrinter(): Printer {
  const printer = useContext(PrinterContext)
  if (!printer) throw new Error("usePrinter used outside PrinterProvider")
  return printer
}

function createDebounced<T>(source: Accessor<T>, delayMs: number): Accessor<T> {
  const [value, setValue] = createSignal(source())
  createEffect(() => {
    const next = source()
    const timer = setTimeout(() => setValue(() => next), delayMs)
    onCleanup(() => clearTimeout(timer))
  })
  return value
}

function downloadBlob(blob: Blob, fileName: string): void {
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = href
  anchor.download = fileName
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(href), REVOKE_DELAY_MS)
}
