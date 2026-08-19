import { For, type Component } from "solid-js"
import type { RenderedCard } from "./printer"

export const CARDS_PER_PAGE = 9

function toPages(cards: RenderedCard[]): RenderedCard[][] {
  const pages: RenderedCard[][] = []
  for (let i = 0; i < cards.length; i += CARDS_PER_PAGE)
    pages.push(cards.slice(i, i + CARDS_PER_PAGE))
  return pages
}

export const Document: Component<{ cards: RenderedCard[] }> = (props) => (
  <For each={toPages(props.cards)}>{(page) => <Page cards={page} />}</For>
)

const Page: Component<{ cards: RenderedCard[] }> = (props) => (
  <div class="page">
    <For each={props.cards}>{(card) => <CardComponent card={card} />}</For>
  </div>
)

const CardComponent: Component<{ card: RenderedCard }> = (props) => (
  <div class="card" data-card-id={props.card.id}>
    <For each={props.card.layers}>{(layer) => <img class="layer" src={layer.src} alt="" />}</For>
  </div>
)
