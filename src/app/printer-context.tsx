import { createContext, useContext, type JSX } from "solid-js"
import { createPrinter, type Printer } from "./create-printer"

const PrinterContext = createContext<Printer>()

export const PrinterProvider = (props: { children: JSX.Element }) => {
  const printer = createPrinter()

  return <PrinterContext.Provider value={printer}>{props.children}</PrinterContext.Provider>
}

export function usePrinter(): Printer {
  const printer = useContext(PrinterContext)
  if (!printer) throw new Error("usePrinter used outside PrinterProvider")
  return printer
}
