import * as htmlparser2 from "htmlparser2"
let currentType: string | null = null
let currentIndex = 0
let textTable: {
  id: number
  text: string
  type: string | null
}[] = []
const parser = new htmlparser2.Parser({
  onopentag(name, attributes) {
    currentType = name
  },
  ontext(text) {
    textTable.push({
      id: currentIndex++,
      text,
      type: currentType,
    })
  },
  onclosetag(tagname) {
    currentType = null
  },
})

parser.write(
  "<b>Shift</b>4 (<i>You may pay 4 ⬡ to play this on top of one of your characters named Tinker Bell.</i>)<br><mark>ROCK THE BOAT</mark>When you play this character, deal 1 damage to each opposing character.<br><mark>PUNY PIRATE!</mark>During your turn, whenever this character banishes another character in a challenge, you may deal 2 damage to chosen opposing character.",
)

parser.write(
  "<b>Singer</b>5<i>(This character counts as cost 4 to sing songs.)</i><br><mark>A WONDERFUL DREAM</mark>↷− Remove up to 3 damage from chosen Princess character.",
)
parser.end()

console.table(textTable)
