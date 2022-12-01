const DECK = "starter"
const PRINT_BACK = false

let root = document.getElementById("root")
let page = document.createElement("div")

for (let i = 0; i < (PRINT_BACK ? 9 : 61); i++) {
  let img = document.createElement("img")
  img.classList.add("img")

  if (PRINT_BACK) {
    img.src = `/resources/Card Back.png`
  } else {
    let paddedIndex = `${i}`.padStart(3, "0")
    img.src = `/cards/${DECK}/${paddedIndex}.png`
  }

  if (i % 9 === 0) {
    page = document.createElement("div")
    page.classList.add("page")
    root?.appendChild(page)
  }
  page.appendChild(img)
}
