// Thin wrapper over the Typst WASM engine ($typst): point it at the bundled compiler +
// renderer wasm, preload the DB's fonts, map remote images into the compiler's shadow VFS
// (Typst can't fetch http:// itself), and compile a source string to SVG or PDF. One engine,
// so preview and PDF come from the same compile — no two-emitter drift (docs/goal.md).

import { $typst, preloadRemoteFonts } from "@myriaddreamin/typst.ts"
import compilerModule from "@myriaddreamin/typst-ts-web-compiler/wasm?url"
import rendererModule from "@myriaddreamin/typst-ts-renderer/wasm?url"

let configured = false

// Configure the engine once (idempotent). Fonts are fetched to bytes and handed to the
// compiler directly — the URL-lazy loader was unreliable about actually registering them.
export async function configureTypst(fontUrls: string[]): Promise<void> {
  if (configured) return
  const fonts = await Promise.all(
    fontUrls.map(async (url) => {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`font fetch failed (${response.status}): ${url}`)
      return new Uint8Array(await response.arrayBuffer())
    }),
  )
  $typst.setCompilerInitOptions({
    getModule: () => compilerModule,
    beforeBuild: [preloadRemoteFonts(fonts)],
  })
  $typst.setRendererInitOptions({ getModule: () => rendererModule })
  configured = true
}

// Fetch each unique URL and map its bytes into the shadow VFS; return url → virtual path.
export async function loadImages(urls: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  let index = 0
  for (const url of urls) {
    if (map.has(url)) continue
    const response = await fetch(url)
    if (!response.ok) throw new Error(`image fetch failed (${response.status}): ${url}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    const ext = (url.split(/[?#]/)[0].split(".").pop() ?? "bin").toLowerCase()
    const path = `/images/${index++}.${ext}`
    await $typst.mapShadow(path, bytes)
    map.set(url, path)
  }
  return map
}

export async function compileSvg(source: string): Promise<string> {
  return await $typst.svg({ mainContent: source })
}

export async function compilePdf(source: string): Promise<Uint8Array> {
  const bytes = await $typst.pdf({ mainContent: source })
  if (!bytes) throw new Error("PDF export produced no data")
  return bytes
}
