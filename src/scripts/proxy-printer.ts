const DECK = "starter"
const PRINT_BACK = true

let root = document.getElementById("root")
let page = document.createElement("div")

for (let i = 0; i < (PRINT_BACK ? 9 : 61); i++) {
  let img = document.createElement("img")
  img.classList.add("img")
  img.src = `/cards/resources/Card Back.png`

  let paddedIndex = `${i}`.padStart(3, "0")

  if (!PRINT_BACK) {
    img.src = `/cards/${DECK}/${paddedIndex}.png`
  }

  if (i % 9 === 0) {
    page = document.createElement("div")
    page.classList.add("page")
    root?.appendChild(page)
  }
  page.appendChild(img)
}

// document.body.addEventListener("click", e => {
//     console.log(direction);
//     if (direction === "rtl") {
//         document.body.classList.remove("rtl")
//         document.body.classList.add("ltr")
//         direction = "ltr"
//     } else {
//         document.body.classList.add("rtl")
//         document.body.classList.remove("ltr")
//         direction = "rtl"
//     }
// }, false)
