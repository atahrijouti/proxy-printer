export type LorcaniaJson = {
  cards: LorcaniaCard[]
}

export type LorcaniaCard = {
  name: string
  title: string
  cost: number
  inkwell: number
  attack: number
  defence: number
  color: number
  type: string
  action: string | null
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

export type Card = {
  id: string
  imageUrl: string
  // color: string
  text: string
  abilities: string[] | null
  // inkwell: boolean
  overlays: string[]
  name: LorcaniaCard["name"]
  title: LorcaniaCard["title"]
  // cost: LorcaniaCard["cost"]
  // attack: LorcaniaCard["attack"]
  // defence: LorcaniaCard["defence"]
  // type: LorcaniaCard["type"]
  // flavour: LorcaniaCard["flavour"]
  // separator: LorcaniaCard["separator"]
  // stars: LorcaniaCard["stars"]
  // number: LorcaniaCard["number"]
  // rarity: LorcaniaCard["rarity"]
  traits: LorcaniaCard["traits"]
}

export type CardDict = { [index: string]: Card }

export type LocaleDict = { [index: string]: string }

export const clean = (text: string) => {
  return (
    text
      // remove unwanted \u0003 character
      .replace(new RegExp("\u0003", "g"), "")

      // remove line returns from text
      .replace(new RegExp("\n", "g"), " ")

      // remove repeated spaces
      .replace(new RegExp("\\s+", "g"), " ")

      // move parens insisde of <i> tag
      .replace(new RegExp("\\(<i>", "g"), "<i>(")
      .replace(new RegExp("</i>\\)", "g"), ")</i>")

      // move dot outside of <b> tag
      .replace(new RegExp("\\.</b>", "g"), "</b>.")

      // no bold for ⬡
      .replace(new RegExp("<b>⬡</b>", "g"), "⬡")

      // remove spaces between tags
      .replace(new RegExp(">\\s+<", "g"), "><")

      // add space between </b>|<i>
      .replace(new RegExp("</b><i>", "g"), "</b> <i>")

      // put reminder inside <i></i>
      .replace(new RegExp("(<b>[^<]+</b>[\\s|\\+|\\d]+)(\\([^\\)]+\\))", "g"), "$1<i>$2</i>")

      // replace dashes with em dash
      .replace(new RegExp("- ", "g"), "\u2212 ")

      // replace quirky quotes with single quotes
      .replace(new RegExp("\u2018", "g"), "'")

      // Add space before em dash
      .replace(new RegExp("([^\\s]+)\u2212", "g"), "$1 \u2212")
  )
}

export const keepDictFields = ({
  name,
  title,
  // cost,
  // attack,
  // defence,
  // type,
  // flavour,
  // separator,
  // stars,
  // number,
  // rarity,
  traits,
}: LorcaniaCard) => ({
  name,
  title,
  traits,
  // flavour: flavour ? clean(flavour) : null,
  // cost,
  // attack,
  // defence,
  // type,
  // separator,
  // stars,
  // number,
  // rarity,
})

export const mapColor = (color: number) => {
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

export const getCardOverlays = (card: LorcaniaCard) => {
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

export const abilitiesFromText = (text: string) => {
  if (!text.trim().length) {
    return null
  }
  return text.split("<br>").map((ability: string) => `${ability.trim()}`)
}

export const toUpperCaseSlug = (text: string) => {
  return text
    .toUpperCase()
    .replace(/ /g, "_")
    .replace(/[^\w_]+/g, "")
}
