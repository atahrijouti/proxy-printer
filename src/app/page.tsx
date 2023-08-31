"use client"

import { ChangeEvent, useCallback, useEffect, useState } from "react"
import _debounce from "lodash/debounce"

import "./deck-printer.css"

const CARDS_PER_PAGE = 9

type CardDict = {
  [index: string]: Card
}

type Card = {
  id: string
  imageUrl: string
  // color: string
  text: string
  name: string
  title: string
  // cost: number
  // inkwell: boolean
  // attack: number
  // defence: number
  // type: string
  // flavour: string | null
  // separator: string | null
  // stars: number
  // number: number
  // rarity: string
  traits: string[]
  overlays: string[]
}

type Page = {
  cards: Card[]
}

const Overlay = ({ url }: { url: string }) => {
  return <img src={url} className="img overlay radius" />
}

const Image = (card: Partial<Card>) => {
  const textRef = useCallback((node: HTMLDivElement) => {
    if (node === null) {
      return
    }

    const height = node.clientHeight
    if (height < 88) {
      return
    }
    const parent = node.parentElement
    console.log(parent, height)
    node.style.setProperty("font-size", "9px")
  }, [])
  const cardText =
    card.text
      ?.split("<br>")
      .map((text) => `<p>${text}</p>`)
      .join("") ?? ""

  return (
    <div className={`card-sleeve ${card.type ?? ""}`}>
      <img src={card.imageUrl} className="img radius" />
      {card.overlays?.length &&
        card.overlays.map((overlay) => <Overlay key={overlay} url={overlay} />)}
      <span className="name overlay">{card.name}</span>
      {card.title?.length && <span className="title overlay">{card.title}</span>}
      <span className="traits overlay">{card.traits?.join(" • ")}</span>
      <div className="text-container overlay">
        <div className="text" ref={textRef} dangerouslySetInnerHTML={{ __html: cardText }} />
      </div>
    </div>
  )
}

type PageProps = {
  cards: Partial<Card>[]
}
const Page = ({ cards }: PageProps) => {
  return (
    <div className="page">
      {cards?.map((card, index) => <Image key={`${index}-${card.id}`} {...card} />)}
    </div>
  )
}

type CardListProps = {
  list: Card[]
}
const CardList = ({ list }: CardListProps) => {
  const [pages, setPages] = useState<Page[]>([])

  useEffect(() => {
    const pages: Page[] = []

    for (let i = 0; i < list.length; i += CARDS_PER_PAGE) {
      pages.push({
        cards: list.slice(i, i + CARDS_PER_PAGE),
      })
    }

    setPages(pages)
  }, [list])

  if (!list.length) {
    return null
  }

  return pages.map((page, index) => <Page key={index} {...page} />)
}

const CardBackList = () => {
  return (
    <Page
      cards={Array.from({ length: 9 }).map(() => ({
        imageUrl: "/cards/lorcana/card-back.jpg",
        id: "Card Back",
      }))}
    />
  )
}

const mapPrompt = (dict: CardDict, prompt: string) => {
  if (!Object.keys(dict).length) {
    return []
  }
  if (prompt.trim() === "") {
    return Object.values(dict)
  }
  const lines = prompt.split("\n")
  const cards: Card[] = []
  lines.forEach((line) => {
    const matches = line.match(/^(\d+)\s(.*)$/)

    if (!matches) {
      return
    }

    const count = Number(matches[1])
    const id = matches[2]
    const card = dict[id.toLowerCase()]

    if (!card) {
      return
    }

    Array.from({ length: count }).forEach((_) => cards.push(card))
  })
  return cards
}

export default () => {
  const [isCardBack, setIsCardBack] = useState(false)
  const [deckName, setDeckName] = useState("Deck")
  const [displayedCards, setDisplayedCards] = useState<Card[]>([])
  const [dictUrl, setDictUrl] = useState<string>("/data/lorcana-proxy-cards.json")
  const [cardDict, setCardDict] = useState<{ [index: string]: Card }>({})
  const [cardPrompt, setCardPrompt] = useState<string>(`1 Fire The Cannons!`)

  useEffect(() => {
    fetchDict()
  }, [dictUrl])

  useEffect(() => {
    if (isCardBack) {
      document.body.classList.add("card-back")
      document.title = "Card Back"
    } else {
      document.body.classList.remove("card-back")
      document.title = deckName
    }
  }, [isCardBack, deckName])

  useEffect(() => {
    rebuildList()
  }, [cardPrompt, cardDict])

  const fetchDict = useCallback(
    _debounce(() => {
      const asyncCall = async () => {
        try {
          let response = await fetch(dictUrl)
          const data = await response.json()
          setCardDict(data)
        } catch (e) {
          setCardDict({})
          console.log("couldn't fetch json")
        }
      }
      asyncCall()
    }, 500),
    [dictUrl],
  )

  const rebuildList = useCallback(
    _debounce(() => {
      const display = mapPrompt(cardDict, cardPrompt)
      setDisplayedCards(display)
    }, 500),
    [cardDict, cardPrompt],
  )

  const handleCardPromptChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setCardPrompt(e.target.value)
  }, [])

  const handleDictUrlChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setDictUrl(e.target.value)
  }, [])
  const handleDeckNameChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setDeckName(e.target.value)
  }, [])

  return (
    <>
      <aside className="controls no-print">
        <div>
          <label>
            Card backs
            <input
              type="checkbox"
              value="Card Backs"
              onChange={() => setIsCardBack(!isCardBack)}
              checked={isCardBack}
            />
          </label>
        </div>
        <div>
          <input type="text" onChange={handleDictUrlChange} value={dictUrl} />
        </div>
        <div>
          <input type="text" onChange={handleDeckNameChange} value={deckName} />
        </div>
        <div>
          <textarea
            className="card-prompt"
            onChange={handleCardPromptChange}
            value={cardPrompt}
          ></textarea>
        </div>
      </aside>
      <main>{isCardBack ? <CardBackList /> : <CardList list={displayedCards} />}</main>
    </>
  )
}
