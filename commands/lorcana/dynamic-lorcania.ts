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

export type LorcaniaJson = {
  cards: LorcaniaCard[]
}

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

const handleKeywordAbilities = (text: string) => {
  const KeywordRegExp = "<b>([^<]+)</b>\\s?(\\+?)(\\d?)\\s?<i>([^<]+)</i>"
  const matches = text.match(new RegExp(KeywordRegExp))
  if (!matches) {
    return null
  }

  const [_matchedString, keyword, plus, number, reminder] = matches

  const type = `keyword${number ? ":number" : ""}${plus ? ":plus" : ""}`
  const pattern = `<b>{keyword}</b> ${plus ? "+" : ""}${number ? "{number} " : ""}<i>{reminder}</i>`

  const values = {
    keyword,
    ...(number && { number: Number(number) }),
    reminder,
  }

  return {
    type,
    pattern,
    values,
  }
}

const handleSong = (text: string) => {
  const SongRegExp = "<i>A character with cost (\\d) or more can ↷ to sing this song for free.</i>"
  const matches = text.match(new RegExp(SongRegExp))

  if (!matches) {
    return null
  }

  const [_matchedString, cost] = matches
  return {
    pattern: "<i>(A character with cost {cost} or more can ↷ to sing this song for free.)</i>",
    type: "song",
    values: {
      cost,
    },
  }
}

const handleCharacterAbilities = (text: string) => {
  const MarkRegExp = "<mark>([^<]+)</mark> (.*)"
  const matches = text.match(new RegExp(MarkRegExp))
  if (!matches) {
    return null
  }

  const [_matchedString, name, description] = matches

  return {
    pattern: "<mark>{name}</mark> {description}",
    type: "character-ability",
    values: {
      name,
      description,
    },
  }
}

const handlePlainAbility = (text: string) => {
  return {
    pattern: "{text}",
    type: "plain",
    values: {
      text,
    },
  }
}

const program = async () => {
  const file = await readFile("public/data/lorcania-cards.json", "utf8")
  const json = JSON.parse(file) as LorcaniaJson

  const typedLorcania = {
    cards: json.cards.map((card) => {
      const cleanText = clean(card.action ?? "")
      const actionTyped = cleanText.split("<br>")?.map((ability) => {
        return (
          handleKeywordAbilities(ability) ||
          handleSong(ability) ||
          handleCharacterAbilities(ability) ||
          handlePlainAbility(ability)
        )
      })

      return { ...card, actionTyped }
    }),
  }

  await writeFile("public/data/typed-lorcania.json", JSON.stringify(typedLorcania, null, 2))
}

program()
