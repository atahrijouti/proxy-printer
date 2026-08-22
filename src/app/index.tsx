/* @refresh reload */
import "./styles.css"

import type { Component } from "solid-js"
import { render } from "solid-js/web"

import { Document } from "./document"
import { PrinterProvider } from "./printer-context"
import { Sidebar } from "./sidebar"
import { embeddedStyles } from "./styles"

const App: Component = () => (
  <>
    <style>{embeddedStyles}</style>
    <PrinterProvider>
      <aside class="controls no-print">
        <Sidebar />
      </aside>
      <main>
        <Document />
      </main>
    </PrinterProvider>
  </>
)

const root = document.getElementById("root")
if (!(root instanceof HTMLElement)) {
  throw new Error("Root element not found in index.html")
}

render(() => <App />, root)
