import { type Component, Show } from "solid-js"

import { usePrinter } from "./printer-context"

export const Sidebar: Component = () => {
  const { settings, setSettings, status, ready, building, downloadPdf } = usePrinter()

  return (
    <>
      <input
        type="text"
        value={settings.dbUrl}
        onInput={(event) => setSettings("dbUrl", event.currentTarget.value)}
      />
      <label>
        <input
          type="checkbox"
          checked={settings.cardBacks}
          onChange={() => setSettings("cardBacks", !settings.cardBacks)}
        />
        Card backs
      </label>
      <textarea
        class="deck"
        placeholder="1 card id per line — blank prints all"
        value={settings.deck}
        onInput={(event) => setSettings("deck", event.currentTarget.value)}
        disabled={settings.cardBacks}
      />
      <button onClick={downloadPdf} disabled={!ready() || building()}>
        {building() ? "Building PDF…" : "Download PDF"}
      </button>
      <Show when={status()}>
        <div class="msg">{status()}</div>
      </Show>
    </>
  )
}
