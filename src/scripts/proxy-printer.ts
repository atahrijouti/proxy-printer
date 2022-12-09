let PRINT_BACK = true
PRINT_BACK = false
const CARDS_PER_PAGE = 9

const DECK = PRINT_BACK ? "Card Back" : "base set"
console.log(DECK)
if (PRINT_BACK) {
  document.body.classList.add("card-back")
} else {
  document.body.classList.remove("card-back")
}

document.title = DECK

let root = document.getElementById("root")

const images = []

const makeImg = (src: string, classNames?: string[]) => {
  let img = document.createElement("img")
  img.classList.add("img")
  if (classNames) {
    classNames.forEach((className) => img.classList.add(className))
  }
  img.src = src
  return img
}

for (let i = 96; i <= (PRINT_BACK ? 9 : 102); i++) {
  if (PRINT_BACK) {
    images.push(makeImg(`/resources/Card Back.png`))
  } else {
    let paddedIndex = `${i}`.padStart(3, "0")
    Array.from({ length: 20 }).forEach(() => {
      images.push(makeImg(`/cards/${DECK}/${paddedIndex}fe.jpg`, ["radius"]))
    })
  }
}

for (let i = 0; i < images.length; i += CARDS_PER_PAGE) {
  const chunk = images.slice(i, i + CARDS_PER_PAGE)
  const page = document.createElement("div")
  page.classList.add("page")
  chunk.forEach((image) => page.appendChild(image))
  root?.appendChild(page)
}
