import { type Component, Index } from "solid-js"

import { CARDS_PER_PAGE, type RenderedCard } from "~/printer"

import { usePrinter } from "./printer-context"

function paginate(cards: RenderedCard[]): RenderedCard[][] {
  const pages: RenderedCard[][] = []
  for (let i = 0; i < cards.length; i += CARDS_PER_PAGE)
    pages.push(cards.slice(i, i + CARDS_PER_PAGE))
  return pages
}

export const Document: Component = () => {
  const printer = usePrinter()

  return (
    <div class="document">
      <Index each={paginate(printer.renderedCards())}>{(page) => <Page cards={page()} />}</Index>
    </div>
  )
}

const Page: Component<{ cards: RenderedCard[] }> = (props) => (
  <div class="page">
    <Index each={props.cards}>{(card) => <Card card={card()} />}</Index>
  </div>
)

const Card: Component<{ card: RenderedCard }> = (props) => (
  <div class="card" data-card-id={props.card.id}>
    <Index each={props.card.layers}>
      {(layer) => <img class="layer" src={layer().src} alt="" />}
    </Index>
  </div>
)
