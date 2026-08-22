import type { CardSpec } from "~/db"

export function selectFromDeck(cards: CardSpec[], deck: string): CardSpec[] {
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
