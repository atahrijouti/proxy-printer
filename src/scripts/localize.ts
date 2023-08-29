import { Parser, parseDocument } from "htmlparser2"

let currentType: string | null = null
let currentIndex = 0
let textTable: {
  id: number
  text: string
  type: string | null
}[] = []

const dom = parseDocument(
  "<b>Shift</b> 4 <i>(You may pay 4 ⬡ to play this on top of one of your characters named Tinker Bell.)</i><br><mark>ROCK THE BOAT</mark> When you play this character, deal 1 damage to each opposing character.<br><mark>PUNY PIRATE!</mark> During your turn, whenever this character banishes another character in a challenge, you may deal 2 damage to chosen opposing character.",
)

/*
<b>Shift</b> 4 <i>(You may pay 4 ⬡ to play this on top of one of your characters named Tinker Bell.)</i>
<br>
<mark>ROCK THE BOAT</mark> When you play this character, deal 1 damage to each opposing character.<br>
<mark>PUNY PIRATE!</mark> During your turn, whenever this character banishes another character in a challenge, you may deal 2 damage to chosen opposing character.
*/

console.table(dom)
