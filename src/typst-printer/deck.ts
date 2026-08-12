import { CARDS_PER_PAGE } from "./compose"
import type { Card, DB } from "./types"

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

export function cardBacks(db: DB): Card[] {
  if (!db.cardBack) return []
  const back = db.cardBack
  return Array.from({ length: CARDS_PER_PAGE }, (_, i) => ({ id: `back-${i}`, image: back }))
}
