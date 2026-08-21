import { Show, type Component } from "solid-js"
import type { Printer } from "../printer"

export const Sidebar: Component<Printer> = (props) => (
  <aside class="controls no-print">
    <input
      type="text"
      value={props.settings.dbUrl}
      onInput={(event) => props.setSettings("dbUrl", event.currentTarget.value)}
    />
    <label>
      <input
        type="checkbox"
        checked={props.settings.cardBacks}
        onChange={() => props.setSettings("cardBacks", !props.settings.cardBacks)}
      />
      Card backs
    </label>
    <textarea
      class="deck"
      placeholder="1 card id per line — blank prints all"
      value={props.settings.deck}
      onInput={(event) => props.setSettings("deck", event.currentTarget.value)}
      disabled={props.settings.cardBacks}
    />
    <button onClick={() => props.downloadPdf()} disabled={!props.ready() || props.building()}>
      {props.building() ? "Building PDF…" : "Download PDF"}
    </button>
    <Show when={props.status()}>
      <div class="msg">{props.status()}</div>
    </Show>
  </aside>
)
