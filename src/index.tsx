/* @refresh reload */
import { render } from "solid-js/web"
import type { Component } from "solid-js"

import "./index.css"
import { Document } from "./document"
import { createPrinter } from "./printer/printer"
import { Sidebar } from "./sidebar"

const App: Component = () => {
  const printer = createPrinter()

  return (
    <>
      <Sidebar printer={printer} />
      <main>
        <Document cards={printer.renderedCards()} />
      </main>
    </>
  )
}

const root = document.getElementById("root")
if (!(root instanceof HTMLElement)) {
  throw new Error("Root element not found in index.html")
}

render(() => <App />, root)
