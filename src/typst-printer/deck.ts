// Selecting the run's cards (docs/goal.md): a decklist picks cards + copies, or a
// card-back page fills the grid with the DB's back image.

import { CARDS_PER_PAGE } from "./compose"
import type { Card, DB } from "./types"

// Decklist → cards to print. "<count> <id>" per line; a blank list prints the whole catalogue.
export function selectFromDeck(cards: Card[], deck: string): Card[] {
  if (!cards.length) return []
  if (deck.trim() === "") return cards
  const out: Card[] = []
  for (const line of deck.split("\n")) {
    const match = line.match(/^(\d+)\s+(.*)$/)
    if (!match) continue
    const card = cards.find((entry) => entry.id === match[2].trim().toLowerCase())
    if (!card) continue
    for (let i = 0; i < Number(match[1]); i++) out.push(card)
  }
  return out
}

// One page of the DB's back image — a bare card (base image, no overlays) per grid cell.
export function cardBacks(db: DB): Card[] {
  if (!db.cardBack) return []
  const back = db.cardBack
  return Array.from({ length: CARDS_PER_PAGE }, (_, i) => ({ id: `back-${i}`, image: back }))
}
