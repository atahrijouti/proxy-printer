import { readFile, writeFile } from "node:fs/promises"
import { CardDict, LocaleDict, toUpperCaseSlug } from "./injest/helpers"

const program = async () => {
  const cardDict = JSON.parse(
    await readFile("public/data/lorcana-proxy-cards.json", "utf8"),
  ) as CardDict

  const localeDict: LocaleDict = {}

  Object.entries(cardDict).forEach(([_id, card]) => {
    const key = `CARD_NAME_${toUpperCaseSlug(card.name)}`
    if (!localeDict[key]) {
      localeDict[key] = card.name
    }
  })

  Object.entries(cardDict).forEach(([_id, card]) => {
    if (!card.title) {
      return
    }
    const key = `CARD_TITLE_${toUpperCaseSlug(card.title)}`
    if (!localeDict[key]) {
      localeDict[key] = card.title
    }
  })

  await writeFile(
    "public/data/localization/source/card-names-and-titles.json",
    JSON.stringify(localeDict, null, 2),
  )
}

program()
