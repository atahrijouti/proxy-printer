import { readFile, writeFile } from "node:fs/promises"
import { Card, LorcaniaCard, clean, getCardOverlays, keepDictFields, mapColor } from "./helpers"

const program = async () => {
  const file = await readFile("public/data/lorcania-cards.json", "utf8")
  const json = JSON.parse(file) as LorcaniaCard[]
  const cards = json
    .filter((card) => card.pack === "204")
    .filter((card) => card.rarity !== "enchanted")
    .sort((a, b) => a.number - b.number)
    .reduce<{ [index: string]: Card }>((acc, card) => {
      let id = `${card.name.toLowerCase()}`
      if (card.title) {
        id += ` - ${card.title.toLowerCase()}`
      }

      const { name, title, traits, ...rest } = keepDictFields(card)

      acc[id] = {
        name,
        title,
        traits,
        text: clean(card.action ?? ""),
        inkwell: !!card.inkwell,
        id,
        color: mapColor(card.color),
        imageUrl: encodeURI(`/cards/lorcana/${`${card.number}`.padStart(4, "0")}.jpg`),
        overlays: getCardOverlays(card),
        ...rest,
      }

      return acc
    }, {})

  // console.log(JSON.stringify(cards))
  await writeFile("public/data/lorcana-proxy-cards.json", JSON.stringify(cards, null, 2))
}

program()
