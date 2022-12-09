;(() => {
  const table = document.querySelector(
    "#mw-content-text > div > table.multicol > tbody > tr > td:nth-child(1) > table > tbody > tr:nth-child(2) > td > table > tbody",
  )

  const SET = "BS"

  if (!table) {
    return
  }

  const cells = Array.from(table.querySelectorAll("td:nth-child(1), td:nth-child(3)"))
  const text = cells
    .map((x) => x.innerText)
    .reduce(function (result, value, index, array) {
      if (index % 2 === 0) {
        const pieces = array.slice(index, index + 2)
        result += `1 ${pieces[1]} ${SET} ${pieces[0].split("/")[0]}\n`
      }
      return result
    }, "")

  setTimeout(async () => {
    await navigator.clipboard.writeText(text)
  }, 1000)
})()
