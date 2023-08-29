import { readFile, writeFile } from "node:fs/promises"

type LorcaniaCard = {
  name: string
  title: string
  cost: number
  inkwell: number
  attack: number
  defence: number
  color: number
  type: string
  action: string
  flavour: string | null
  separator: string | null
  stars: number
  illustrator: string
  language: string
  number: number
  pack: string
  rarity: string
  traits: string[]
}

type Card = {
  id: string
  imageUrl: string
  color: string
  text: string
  inkwell: boolean
  overlays: string[]
  name: LorcaniaCard["name"]
  title: LorcaniaCard["title"]
  cost: LorcaniaCard["cost"]
  attack: LorcaniaCard["attack"]
  defence: LorcaniaCard["defence"]
  type: LorcaniaCard["type"]
  flavour: LorcaniaCard["flavour"]
  separator: LorcaniaCard["separator"]
  stars: LorcaniaCard["stars"]
  number: LorcaniaCard["number"]
  rarity: LorcaniaCard["rarity"]
  traits: LorcaniaCard["traits"]
}

const mapColor = (color: number) => {
  switch (color) {
    case 1:
      return "ruby"
    case 2:
      return "sapphire"
    case 3:
      return "emerald"
    case 4:
      return "amber"
    case 5:
      return "amethyst"
    case 6:
      return "steel"
    default:
      throw new Error(`The color ${color} is not supported`)
  }
}

const clean = (text: string) => {
  return text.replace(new RegExp("\u0003", "g"), "")
}

const keepDictFields = ({
  name,
  title,
  cost,
  attack,
  defence,
  type,
  flavour,
  separator,
  stars,
  number,
  rarity,
  traits,
}: LorcaniaCard) => ({
  name,
  title,
  cost,
  attack,
  defence,
  type,
  flavour: flavour ? clean(flavour) : null,
  separator,
  stars,
  number,
  rarity,
  traits,
})

const getCardOverlays = (card: LorcaniaCard) => {
  const overlays: string[] = []
  const color = mapColor(card.color)
  let overlayType = "action"

  if (card.type === "glimmer") {
    overlayType = "glimmer"
  }

  if (card.traits?.includes("Floodborn")) {
    overlayType = "floodborn"
    const starCount = `${card.stars}`.padStart(2, "0")
    overlays.push(`/overlays/points-${starCount}.png`)
  }

  overlays.push(`/overlays/${color}-${overlayType}.png`)

  return overlays
}

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

      acc[id] = {
        ...keepDictFields(card),
        inkwell: !!card.inkwell,
        id,
        color: mapColor(card.color),
        text: clean(card.action ?? ""),
        imageUrl: encodeURI(
          `/cards/lorcana/${`${card.number}`.padStart(4, "0")}.jpg`,
        ),
        overlays: getCardOverlays(card),
      }

      return acc
    }, {})

  // console.log(JSON.stringify(cards))
  await writeFile("public/data/lorcana-proxy-cards.json", JSON.stringify(cards, null, 2))
}

program()
