import { Index, type Component } from "solid-js"
import { CARDS_PER_PAGE, embeddedStyles } from "./printer/page"
import type { RenderedCard } from "./printer"

function paginate(cards: RenderedCard[]): RenderedCard[][] {
  const pages: RenderedCard[][] = []
  for (let i = 0; i < cards.length; i += CARDS_PER_PAGE)
    pages.push(cards.slice(i, i + CARDS_PER_PAGE))
  return pages
}

export const Document: Component<{ cards: RenderedCard[] }> = (props) => (
  <>
    <style>{embeddedStyles}</style>
    <div class="document">
      <Index each={paginate(props.cards)}>{(page) => <Page cards={page()} />}</Index>
    </div>
  </>
)

const Page: Component<{ cards: RenderedCard[] }> = (props) => (
  <div class="page">
    <Index each={props.cards}>{(card) => <CardComponent card={card()} />}</Index>
  </div>
)

const CardComponent: Component<{ card: RenderedCard }> = (props) => (
  <div class="card" data-card-id={props.card.id}>
    <Index each={props.card.layers}>
      {(layer) => <img class="layer" src={layer().src} alt="" />}
    </Index>
  </div>
)
