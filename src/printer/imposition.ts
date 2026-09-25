import type { CardSpec } from "~/db/schema"

import { CARDS_PER_PAGE } from "./page"

export type Imposition = { kind: "deck"; deck: string } | { kind: "backs" }

function selectFromDeck(cards: CardSpec[], deck: string): CardSpec[] {
  if (!cards.length) return []
  if (deck.trim() === "") return cards
  const out: CardSpec[] = []
  for (const line of deck.split("\n")) {
    const match = line.match(/^(\d+)\s+(.*)$/)
    if (!match) continue
    const card = cards.find((entry) => entry.id === match[2].trim().toLowerCase())
    if (!card) continue
    for (let i = 0; i < Number(match[1]); i++) out.push(card)
  }
  return out
}

function cardBacks(cardBack: string | undefined): CardSpec[] {
  if (!cardBack) return []
  return Array.from({ length: CARDS_PER_PAGE }, (_, i) => ({ id: `back-${i}`, image: cardBack }))
}

export function selectCards(
  cards: CardSpec[],
  cardBack: string | undefined,
  imposition: Imposition,
): CardSpec[] {
  return imposition.kind === "backs" ? cardBacks(cardBack) : selectFromDeck(cards, imposition.deck)
}
