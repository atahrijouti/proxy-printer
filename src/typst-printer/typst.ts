import { $typst, preloadRemoteFonts } from "@myriaddreamin/typst.ts"
import compilerModule from "@myriaddreamin/typst-ts-web-compiler/wasm?url"
import rendererModule from "@myriaddreamin/typst-ts-renderer/wasm?url"

let configured = false

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`fetch failed (${response.status}): ${url}`)
  return new Uint8Array(await response.arrayBuffer())
}

export async function configureTypst(fontUrls: string[]): Promise<void> {
  if (configured) return
  const fonts = await Promise.all(fontUrls.map(fetchBytes))
  $typst.setCompilerInitOptions({
    getModule: () => compilerModule,
    beforeBuild: [preloadRemoteFonts(fonts)],
  })
  $typst.setRendererInitOptions({ getModule: () => rendererModule })
  configured = true
}

export async function loadImages(urls: string[]): Promise<Map<string, string>> {
  const paths = new Map<string, string>()
  for (const url of urls) {
    if (paths.has(url)) continue
    const ext = (url.split(/[?#]/)[0].split(".").pop() ?? "bin").toLowerCase()
    const path = `/images/${paths.size}.${ext}`
    await $typst.mapShadow(path, await fetchBytes(url))
    paths.set(url, path)
  }
  return paths
}

export async function compileSvg(source: string): Promise<string> {
  return await $typst.svg({ mainContent: source })
}

export async function compilePdf(source: string): Promise<Uint8Array> {
  const bytes = await $typst.pdf({ mainContent: source })
  if (!bytes) throw new Error("PDF export produced no data")
  return bytes
}
