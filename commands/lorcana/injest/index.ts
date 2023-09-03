import { readFile, writeFile } from "node:fs/promises"
import {
  CardDict,
  LorcaniaJson,
  abilitiesFromText,
  clean,
  getCardOverlays,
  keepDictFields,
  mapColor,
} from "./helpers"

const program = async () => {
  const file = await readFile("public/data/lorcania-cards.json", "utf8")
  const json = JSON.parse(file) as LorcaniaJson

  const cards = json.cards
    .filter((card) => card.pack === "204")
    .filter((card) => card.rarity !== "enchanted")
    .sort((a, b) => a.number - b.number)
    .reduce<CardDict>((acc, card) => {
      let id = `${card.name.toLowerCase()}`
      if (card.title) {
        id += ` - ${card.title.toLowerCase()}`
      }

      const { name, title, traits, ...rest } = keepDictFields(card)
      // const { name, title, traits } = card

      const text = clean(card.action ?? "")
      const abilities = abilitiesFromText(text)

      acc[id] = {
        name,
        title,
        traits,
        text,
        abilities,
        id,
        imageUrl: encodeURI(`/cards/lorcana/${`${card.number}`.padStart(4, "0")}.jpg`),
        overlays: getCardOverlays(card),
        inkwell: !!card.inkwell,
        color: mapColor(card.color),
        ...rest,
      }

      return acc
    }, {})

  // console.log(JSON.stringify(cards))
  await writeFile("public/data/lorcana-proxy-cards.json", JSON.stringify(cards, null, 2))
}

program()
