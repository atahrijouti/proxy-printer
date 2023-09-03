import { readFile, writeFile } from "node:fs/promises"
import { CardDict, LocaleDict } from "./injest/helpers"

const program = async () => {
  const cardDict = JSON.parse(
    await readFile("public/data/lorcana-proxy-cards.json", "utf8"),
  ) as CardDict

  const abilitiesDict: LocaleDict = {}
  const nameDict: LocaleDict = {}
  const titleDict: LocaleDict = {}
  const traitsSet = new Set<string>()

  Object.entries(cardDict).forEach(([_key, card]) => {
    const cardNumber = `${card.number}`.padStart(4, "0")

    const nameId = `NAME_${cardNumber}`
    if (!nameDict[nameId]) {
      nameDict[nameId] = card.name
    }

    if (card.title) {
      titleDict[`TITLE_${cardNumber}`] = card.title
    }

    card.traits.forEach((trait) => traitsSet.add(trait))

    card.abilities?.forEach((ability, index) => {
      const cardType = card.type === "glimmer" ? "CHARACTER" : "ACTION"

      abilitiesDict[`${cardType}-${cardNumber}-${index}`] = ability
    })
  })

  const sortedAbilitiesDict = Object.fromEntries(
    Object.entries(abilitiesDict).sort(([_ka, a], [_kb, b]) => {
      return a.localeCompare(b)
    }),
  )

  const traitDict = Object.fromEntries(
    Array.from(traitsSet.entries()).map(([key, trait]) => [`TRAIT_${key}`, trait]),
  )

  await writeFile(
    "public/data/localization/source/abilities.json",
    JSON.stringify(sortedAbilitiesDict, null, 2),
  )

  await writeFile(
    "public/data/localization/source/lorcana.json",
    JSON.stringify({ ...sortedAbilitiesDict, ...traitDict, ...nameDict, ...titleDict }, null, 2),
  )
}

program()
