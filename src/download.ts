const REVOKE_DELAY_MS = 10_000

export function downloadBlob(blob: Blob, fileName: string): void {
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = href
  anchor.download = fileName
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(href), REVOKE_DELAY_MS)
}
