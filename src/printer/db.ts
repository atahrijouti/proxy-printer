import { loadResources, type RenderContext } from "./resources"
import type { Card, DB } from "./types"

export interface PreparedDb {
  cards: Card[]
  cardBack?: string
  ctx: RenderContext
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
  const resources = await loadResources(db.presentation?.fonts ?? [], symbolUrls(db))
  return {
    cards: db.cards,
    cardBack: db.cardBack,
    ctx: {
      ...resources,
      styles: db.presentation?.styles ?? {},
      symbols: db.symbols ?? {},
    },
  }
}
