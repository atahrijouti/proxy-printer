;(async () => {
  let wait = async (delay) => {
    return new Promise((resolve) => setTimeout(resolve, delay))
  }

  let collectImages = () => {
    let cardElements = document.querySelectorAll(".scan__pic")
    let cardData = Array.from(cardElements).map((img, i) => ({
      index: `${i}`.padStart(3, 0),
      url: img.src,
    }))
    return cardData
  }

  let downloadImage = (url, name) => {
    var link = document.createElement("a")
    link.href = url
    link.download = name
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  for (const image of collectImages()) {
    console.log(image)
    await wait(200)
    downloadImage(image.url, `${image.index}.png`)
  }
})()

// card size    63mm x 88mm
// A4 size      842px x 595px

// 1024px -> 63mm
// 1420px -> 88mm

// 1024 ->
