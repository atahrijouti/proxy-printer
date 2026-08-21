import { loadResources, type Resources } from "./resources"
import type { CardSpec, DB, Style, Symbols } from "./types"

export interface PreparedDb {
  cards: CardSpec[]
  cardBack?: string
  resources: Resources
  styles: Record<string, Style>
  symbols: Symbols
}

function symbolUrls(db: DB): string[] {
  return [...new Set(Object.values(db.symbols ?? {}))]
}

export async function fetchDb(url: string): Promise<DB> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`DB fetch failed (${response.status})`)
  return (await response.json()) as DB
}

export async function prepareDb(db: DB): Promise<PreparedDb> {
  return {
    cards: db.cards,
    cardBack: db.cardBack,
    resources: await loadResources(db.presentation?.fonts ?? [], symbolUrls(db)),
    styles: db.presentation?.styles ?? {},
    symbols: db.symbols ?? {},
  }
}
