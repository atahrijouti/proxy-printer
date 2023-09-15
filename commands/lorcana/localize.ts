import { readFile, writeFile } from "node:fs/promises"
import { CardDict, LocaleDict } from "./injest/helpers"

const program = async () => {
  const cardDict = JSON.parse(
    await readFile("public/data/lorcana-db.json", "utf8"),
  ) as CardDict

  const localeDict: LocaleDict = {}
  const traitsSet = new Set<string>()

  Object.entries(cardDict).forEach(([_key, card]) => {
    const cardNumber = `${card.number}`.padStart(4, "0")

    const nameId = `NAME_${cardNumber}`
    if (!localeDict[nameId]) {
      localeDict[nameId] = card.name
    }

    if (card.title) {
      localeDict[`TITLE_${cardNumber}`] = card.title
    }

    card.traits.forEach((trait) => traitsSet.add(trait))

    card.abilities?.forEach((ability, index) => {
      const cardType = card.type === "glimmer" ? "CHARACTER" : "ACTION"

      localeDict[`${cardType}-${cardNumber}-${index}`] = ability
    })
  })
  const traitDict = Object.fromEntries(
    Array.from(traitsSet.entries()).map(([key, trait]) => [`TRAIT_${key}`, trait]),
  )

  await writeFile(
    "public/data/localization/source/lorcana-en.json",
    JSON.stringify({ ...localeDict, ...traitDict }, null, 2),
  )
}

program()
