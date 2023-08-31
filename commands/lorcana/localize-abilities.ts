import { readFile, writeFile } from "node:fs/promises"
import { CardDict, LocaleDict, Card, toUpperCaseSlug } from "./injest/helpers"

const extractKeywordLocaleKeys = (ability: string, dict: LocaleDict, card: Card) => {
  const KeywordRegExp = "<b>([^<]+)</b>(\\s?\\+?\\d?\\s?)<i>([^<]+)</i>"
  const matches = ability.match(new RegExp(KeywordRegExp))
  if (!matches) {
    return false
  }

  const [_matchedString, keywordRaw, _valueRaw, reminderRaw] = matches
  const keywordName = keywordRaw.toUpperCase()
  const keywordKeyName = `KEYWORD_${keywordName}`

  if (keywordName === "CHALLENGER" && dict[keywordKeyName]) {
    return true
  }

  if (keywordName === "CHALLENGER") {
    dict[`${keywordKeyName}`] = keywordName
    dict[`${keywordKeyName}_REMINDER_WHEN`] =
      "(When challenging, this character get +{keywordNumber} ※.)"
    dict[`${keywordKeyName}_REMINDER_WHILE`] =
      "(While challenging, this character get +{keywordNumber} ※.)"
    return true
  }

  const reminderTagged = reminderRaw
    .replace(new RegExp("\\d", "g"), "{keywordNumber}")
    .replace(new RegExp(keywordRaw, "g"), `{key:${keywordKeyName}}`)
    .replace(new RegExp(card.name, "g"), `{cardName}`)

  if (dict[`KEYWORD_${keywordName}`] == undefined) {
    dict[`KEYWORD_${keywordName}`] = keywordRaw
    dict[`KEYWORD_${keywordName}_REMINDER`] = reminderTagged
  }

  return true
}

const extractSongLocaleKey = (ability: string, dict: LocaleDict) => {
  const SongRegExp =
    "<i>\\(A character with cost \\d or more can ↷ to sing this song for free.\\)</i>"
  const matches = ability.match(new RegExp(SongRegExp))

  if (!matches) {
    return false
  }

  if (dict["SONG_REMINDER"] == undefined) {
    dict[`SONG_REMINDER`] =
      "<i>(A character with cost {songCost} or more can ↷ to sing this song for free.)</i>"
  }

  return true
}

const extractMarkLocaleKey = (ability: string, dict: LocaleDict, card: Card) => {
  const MarkRegExp = "<mark>([^<]+)</mark> (.*)"
  const matches = ability.match(new RegExp(MarkRegExp))
  if (!matches) {
    return false
  }

  const [_matchedString, markRaw, textRaw] = matches
  const keywordKeyName = `KEYWORD_${toUpperCaseSlug(markRaw.trim())}`
  const id = toUpperCaseSlug(card.id)
  dict[`MARK_${id}`] = markRaw
  dict[`MARK_${id}_TEXT`] = textRaw
  return true
}

const handlePlainAbility = (
  ability: string,
  dict: LocaleDict,
  abilityIndex: number,
  card: Card,
) => {
  const id = toUpperCaseSlug(card.id)
  dict[`${id}_${abilityIndex}`] = ability
  return true
}

//

const listSortedAbilities = async (cardDict: CardDict) => {
  const abilities: string[] = []

  Object.keys(cardDict).forEach((key) => {
    const card = cardDict[key]
    abilities.push(...(card.abilities ? card.abilities : []))
  })

  const sortedAbilities = abilities.sort((a, b) => a.localeCompare(b))

  await writeFile("public/data/sorted-abilities.json", JSON.stringify(sortedAbilities, null, 2))
}

const program = async () => {
  const cardDict = JSON.parse(
    await readFile("public/data/lorcana-proxy-cards.json", "utf8"),
  ) as CardDict

  const localeDict: LocaleDict = {}

  Object.entries(cardDict).forEach(([_id, card]) => {
    card.abilities?.forEach((ability, abilityIndex) => {
      // extractKeywordLocaleKeys(ability, localeDict, card) ||
      // extractSongLocaleKey(ability, localeDict) ||
      // extractMarkLocaleKey(ability, localeDict, card) ||
      handlePlainAbility(ability, localeDict, abilityIndex, card)
    })
  })

  const sortedLocaleDict = Object.fromEntries(
    Object.entries(localeDict).sort(([_ka, a], [_kb, b]) => {
      return a.localeCompare(b)
    }),
  )

  await writeFile(
    "public/data/localization/source/abilities.json",
    JSON.stringify(sortedLocaleDict, null, 2),
  )
}

program()
