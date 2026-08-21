export async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`fetch failed (${response.status}): ${url}`)
  return new Uint8Array(await response.arrayBuffer())
}
