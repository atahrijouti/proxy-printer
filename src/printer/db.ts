import { loadResources, type Resources } from "./resources"
import type { CardSpec, DB, Style, Symbols } from "~/db"

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

export async function prepareDb(db: DB): Promise<PreparedDb> {
  return {
    cards: db.cards,
    cardBack: db.cardBack,
    resources: await loadResources(db.fonts ?? [], symbolUrls(db)),
    styles: db.styles ?? {},
    symbols: db.symbols ?? {},
  }
}
