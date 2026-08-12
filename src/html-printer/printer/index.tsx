import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Show,
  type Component,
  type JSX,
} from "solid-js"
import { debounce } from "../helpers"

import "./styles.css"

const CARDS_PER_PAGE = 9
const STARTING_URL = "http://localhost:8787/db-sv-print.json"
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
const abbreviations = () => data().abbreviations ?? {}

// an abbreviation ({abbr NAME}) expands to registered content — a symbol image or literal text
type Abbreviation = { type: "image"; src: string } | { type: "text"; value: string }
type Abbreviations = Record<string, Abbreviation>

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

// From a "{" find its matching "}", counting nested braces and honouring "\{" / "\}" escapes.
const matchingBrace = (text: string, open: number): number => {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const ch = text[i]
    if (ch === "\\") {
      i++
      continue
    }
    if (ch === "{") depth++
    else if (ch === "}" && --depth === 0) return i
  }
  return -1
}

// Expand one function call — the text between the braces — to a node.
//   {t <style> <content…>} → <span class="<style>">…</span>  (content parsed recursively)
//   {abbr <name>}          → the registered abbreviation (image → <img>, text → string)
// Anything unrecognised is shown literally, braces included.
const expand = (inner: string, abbr: Abbreviations): JSX.Element => {
  const space = inner.indexOf(" ")
  const fn = space === -1 ? inner : inner.slice(0, space)
  const rest = space === -1 ? "" : inner.slice(space + 1)

  if (fn === "abbr") {
    const name = rest.trim()
    const entry = abbr[name]
    if (!entry) return `{${inner}}`
    return entry.type === "image" ? <img class="glyph" src={entry.src} alt={name} /> : entry.value
  }

  if (fn === "t") {
    const space2 = rest.indexOf(" ")
    const style = space2 === -1 ? rest : rest.slice(0, space2)
    const content = space2 === -1 ? "" : rest.slice(space2 + 1)
    return <span class={style}>{parseMarkup(content, abbr)}</span>
  }

  return `{${inner}}`
}

// Parse inline markup into an ordered list of nodes (plain runs stay strings).
const parseMarkup = (text: string, abbr: Abbreviations): JSX.Element[] => {
  const nodes: JSX.Element[] = []
  let run = ""
  const flush = () => {
    if (run) nodes.push(run)
    run = ""
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === "\\" && (text[i + 1] === "{" || text[i + 1] === "}")) {
      run += text[i + 1]
      i++
      continue
    }
    if (ch === "{") {
      const close = matchingBrace(text, i)
      if (close === -1) {
        run += ch
        continue
      }
      flush()
      nodes.push(expand(text.slice(i + 1, close), abbr))
      i = close
      continue
    }
    run += ch
  }
  flush()
  return nodes
}

const OverlayView: Component<{ overlay: Overlay }> = (props) => {
  const overlay = props.overlay
  if (overlay.type === "image") return <img class="img overlay radius" src={overlay.src} />

  const className = `overlay ${overlay.style ?? ""}`.trim()
  if (overlay.type === "shape") return <div class={className} />

  return Array.isArray(overlay.content) ? (
    <div class={className}>
      <For each={overlay.content}>
        {(paragraph) => <p>{parseMarkup(paragraph, abbreviations())}</p>}
      </For>
    </div>
  ) : (
    <span class={className}>{parseMarkup(overlay.content, abbreviations())}</span>
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
      } catch (e) {
        setDb({ cards: [] })
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
