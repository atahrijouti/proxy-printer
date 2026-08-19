import { Show, type Component } from "solid-js"

export interface SidebarProps {
  dbUrl: string
  setDbUrl: (value: string) => void
  deck: string
  setDeck: (value: string) => void
  cardBacks: boolean
  setCardBacks: (value: boolean) => void
  status: string
  ready: boolean
  onDownload: () => void
}

export const Sidebar: Component<SidebarProps> = (props) => (
  <aside class="controls no-print">
    <input
      type="text"
      value={props.dbUrl}
      onInput={(event) => props.setDbUrl(event.currentTarget.value)}
    />
    <label>
      <input
        type="checkbox"
        checked={props.cardBacks}
        onChange={() => props.setCardBacks(!props.cardBacks)}
      />
      Card backs
    </label>
    <textarea
      class="deck"
      placeholder="1 card id per line — blank prints all"
      value={props.deck}
      onInput={(event) => props.setDeck(event.currentTarget.value)}
      disabled={props.cardBacks}
    />
    <button onClick={props.onDownload} disabled={!props.ready}>
      Download PDF
    </button>
    <Show when={props.status}>
      <div class="msg">{props.status}</div>
    </Show>
  </aside>
)
