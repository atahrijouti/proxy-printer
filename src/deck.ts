import type { Card } from "./types"

const BACKS_PER_PAGE = 9

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

export function cardBacks(cardBack: string | undefined): Card[] {
  if (!cardBack) return []
  return Array.from({ length: BACKS_PER_PAGE }, (_, i) => ({ id: `back-${i}`, image: cardBack }))
}
