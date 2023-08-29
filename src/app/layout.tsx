import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Proxy Printer",
  description: "Generate ready to print proxy cards",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Deck</title>
      </head>

      <body>{children}</body>
    </html>
  )
}
