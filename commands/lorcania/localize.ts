import { readFile, writeFile } from "node:fs/promises"

let currentType: string | null = null
let currentIndex = 0
let textTable: {
  id: number
  text: string
  type: string | null
}[] = []

const WARD_TEMPLATE =
  "<b>Ward</b> <i>(Opponents can't choose this character except to challenge.)</i>"
const CHALLENGER_TEMPLATE =
  "<b>Challenger</b> +2 <i>(While challenging, this character get +2 ※.)</i>"
const SUPPORT_TEMPLATE =
  "<b>Support</b> <i>(Whenever this character quests, you may add their ※ to another chosen character‘s ※ this turn.)</i>"
const SHIFT_TEMPLATE =
  "<b>Shift</b> (\\d) <i>\\(You may pay (\\d) ⬡ to play this on top of one of your characters named {name}\\.\\)</i>"
const RECKLESS_TEMPLATE =
  "<b>Reckless</b> <i>(This character can't quest and must challenge each turn if able.)</i>"
const EVASIVE_TEMPLATE =
  "<b>Evasive</b> <i>(Only characters with Evasive can challenge this character.)</i>"
const SINGER_TEMPLATE = "<b>Singer</b> 5 <i>(This character counts as cost 5 to sing songs.)</i>"
const RUSH_TEMPLATE = "<b>Rush</b> <i>(This character can challenge the turn they're played.)</i>"
const BODYGUARD_TEMPLATE =
  "<b>Bodyguard</b> <i>(This character may enter play exerted. An opposing character who challenges one of your characters must choose one with Bodyguard if able.)</i>"
// ------------------
const tinkerBellText =
  "<b>Shift</b> 4 <i>(You may pay 4 ⬡ to play this on top of one of your characters named Tinker Bell.)</i><br><mark>ROCK THE BOAT</mark> When you play this character, deal 1 damage to each opposing character.<br><mark>PUNY PIRATE!</mark> During your turn, whenever this character banishes another character in a challenge, you may deal 2 damage to chosen opposing character."
//
const program = async () => {
  const cardDict = JSON.parse(await readFile("public/data/lorcana-proxy-cards.json", "utf8"))
  const abilities: string[] = []
  Object.keys(cardDict).forEach((key) => {
    const card = cardDict[key]
    if (!card.text.trim().length) {
      return
    }
    abilities.push(
      ...card.text.split("<br>").map((ability: string) => `${ability.trim()} [${card.id}]`),
    )
  })

  const sortedAbilities = abilities.sort((a, b) => a.localeCompare(b))

  await writeFile("public/data/abilities.json", JSON.stringify(sortedAbilities, null, 2))
}

program()
