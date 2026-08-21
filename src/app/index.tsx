/* @refresh reload */
import { render } from "solid-js/web"
import type { Component } from "solid-js"

import "./styles.css"
import { Document } from "./document"
import { PrinterProvider } from "./printer-context"
import { Sidebar } from "./sidebar"

const App: Component = () => (
  <PrinterProvider>
    <aside class="controls no-print">
      <Sidebar />
    </aside>
    <main>
      <Document />
    </main>
  </PrinterProvider>
)

const root = document.getElementById("root")
if (!(root instanceof HTMLElement)) {
  throw new Error("Root element not found in index.html")
}

render(() => <App />, root)
