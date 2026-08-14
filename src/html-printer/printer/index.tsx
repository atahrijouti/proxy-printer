import { createEffect, createMemo, createSignal, For, Show, type Component } from "solid-js"
import { debounce } from "../helpers/debounce"
import { createMarkup, type Markup, type Abbreviations } from "../helpers/markup"

import "./styles.css"

const CARDS_PER_PAGE = 9
const STARTING_URL = "http://localhost:8787/db-sv-html-print.json"
const STARTING_DECK = `1 tinker bell - giant fairy
1 genie - powers unleashed
1 donald duck - musketeer
1 goofy - musketeer
1 maximus - palace horse
1 ariel - spectacular singer
1 captain hook - thinking a happy thought
1 aladdin - heroic outlaw
1 jasmine - queen of agrabah`

const [data, setDb] = createSignal({ cards: [] } as DB)
// the markup engine, rebuilt from the DB's presentation each time a new DB is fetched
const [markup, setMarkup] = createSignal<Markup>(createMarkup({ abbreviations: {} }))

// overlays are drawn in array order (painter's order); each is one typed primitive
type ImageOverlay = { type: "image"; style?: string; src: string }
type ShapeOverlay = { type: "shape"; style: string }
type TextOverlay = { type: "text"; style?: string; content: string | string[] }
type Overlay = ImageOverlay | ShapeOverlay | TextOverlay

type Card = {
  id: string
  imageUrl: string
  overlays?: Overlay[]
}

type DB = {
  stylesUrl?: string
  cardBackUrl?: string
  abbreviations?: Abbreviations
  cards: Card[]
}

type PageData = {
  cards: Partial<Card>[]
}

const OverlayView: Component<{ overlay: Overlay }> = (props) => {
  const overlay = props.overlay
  if (overlay.type === "image") return <img class="img overlay radius" src={overlay.src} />

  const className = `overlay ${overlay.style ?? ""}`.trim()
  if (overlay.type === "shape") return <div class={className} />

  return Array.isArray(overlay.content) ? (
    <div class={className}>
      <For each={overlay.content}>{(paragraph) => <p>{markup().render(paragraph)}</p>}</For>
    </div>
  ) : (
    <span class={className}>{markup().render(overlay.content)}</span>
  )
}

const Image: Component<Partial<Card>> = (props) => {
  return (
    <div class="card-sleeve">
      <img src={`${props.imageUrl}`} class="img radius" />
      <For each={props.overlays ?? []}>{(overlay) => <OverlayView overlay={overlay} />}</For>
    </div>
  )
}

const Page: Component<PageData> = (props) => {
  return (
    <div class="page">
      <For each={props.cards}>{(card) => <Image {...card} />}</For>
    </div>
  )
}

const CardList: Component<{ list: Card[] }> = (props) => {
  const pages = createMemo<PageData[]>(() => {
    const result: PageData[] = []

    for (let i = 0; i < props.list.length; i += CARDS_PER_PAGE) {
      result.push({
        cards: props.list.slice(i, i + CARDS_PER_PAGE),
      })
    }

    return result
  })

  return <For each={pages()}>{(page) => <Page cards={page.cards} />}</For>
}

const CardBackList: Component = () => {
  return (
    <Page
      cards={Array.from({ length: 9 }).map(() => ({
        imageUrl: data().cardBackUrl,
      }))}
    />
  )
}

const mapPrompt = (db: Card[], prompt: string) => {
  if (!db.length) {
    return []
  }
  if (prompt.trim() === "") {
    return db
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
    const card = db.find((entry) => entry.id === id.toLowerCase())

    if (!card) {
      return
    }

    Array.from({ length: count }).forEach(() => cards.push(card))
  })
  return cards
}

const App: Component = () => {
  const [isCardBack, setIsCardBack] = createSignal(false)
  const [deckName, setDeckName] = createSignal("Deck")
  const [displayedCards, setDisplayedCards] = createSignal<Card[]>([])
  const [DbUrl, setDbUrl] = createSignal<string>(STARTING_URL)
  const [cardPrompt, setCardPrompt] = createSignal<string>(STARTING_DECK)

  const fetchDb = debounce((url: string) => {
    const asyncCall = async () => {
      try {
        const response = await fetch(url)
        const data = await response.json()
        setDb(data)
        setMarkup(createMarkup({ abbreviations: data.abbreviations ?? {} }))
      } catch (e) {
        setDb({ cards: [] })
        setMarkup(createMarkup({ abbreviations: {} }))
        console.log("couldn't fetch json")
      }
    }
    asyncCall()
  }, 500)

  const rebuildList = debounce((cards: Card[], prompt: string) => {
    setDisplayedCards(mapPrompt(cards, prompt))
  }, 500)

  createEffect(() => {
    fetchDb(DbUrl())
  })

  createEffect(() => {
    if (isCardBack()) {
      document.body.classList.add("card-back")
      document.title = "Card Back"
    } else {
      document.body.classList.remove("card-back")
      document.title = deckName()
    }
  })

  createEffect(() => {
    rebuildList(data().cards, cardPrompt())
  })

  return (
    <>
      <aside class="controls no-print">
        <div>
          <label>
            Card backs
            <input
              type="checkbox"
              value="Card Backs"
              onChange={() => setIsCardBack(!isCardBack())}
              checked={isCardBack()}
            />
          </label>
        </div>
        <div>
          <input type="text" onInput={(e) => setDbUrl(e.currentTarget.value)} value={DbUrl()} />
        </div>
        <div>
          <input
            type="text"
            onInput={(e) => setDeckName(e.currentTarget.value)}
            value={deckName()}
          />
        </div>
        <div>
          <textarea
            class="card-prompt"
            onInput={(e) => setCardPrompt(e.currentTarget.value)}
            value={cardPrompt()}
          />
        </div>
      </aside>
      <main>
        <Show when={data().stylesUrl}>
          <link href={data().stylesUrl} rel="stylesheet" />
        </Show>
        <Show when={isCardBack()} fallback={<CardList list={displayedCards()} />}>
          <CardBackList />
        </Show>
      </main>
    </>
  )
}

export default App
