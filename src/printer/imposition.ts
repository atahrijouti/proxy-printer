import type { CardSpec } from "~/db"

import { selectFromDeck } from "./deck"
import { CARDS_PER_PAGE } from "./page"

export type Imposition = { kind: "deck"; deck: string } | { kind: "backs" }

function cardBacks(cardBack: string | undefined): CardSpec[] {
  if (!cardBack) return []
  return Array.from({ length: CARDS_PER_PAGE }, (_, i) => ({ id: `back-${i}`, image: cardBack }))
}

export function selectCards(
  cards: CardSpec[],
  cardBack: string | undefined,
  imposition: Imposition,
): CardSpec[] {
  return imposition.kind === "backs"
    ? cardBacks(cardBack)
    : selectFromDeck(cards, imposition.deck)
}
