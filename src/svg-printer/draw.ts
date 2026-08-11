// Shared geometry so both emitters (SVG view + pdfkit) draw the badge shape
// identically. A rounded rectangle as an SVG path in a LOCAL frame: origin (0,0)
// at the top-left, y growing downward, sizes in the caller's units. Per-corner
// radii, each clamped to half the box. Clockwise from the top-left.

import type { Corners } from "./layout"

export function roundedRectPath(width: number, height: number, corners: Corners): string {
  const clamp = (radius: number) => Math.max(0, Math.min(radius, width / 2, height / 2))
  const tl = clamp(corners.topLeft)
  const tr = clamp(corners.topRight)
  const br = clamp(corners.bottomRight)
  const bl = clamp(corners.bottomLeft)
  return [
    `M${tl},0`,
    `H${width - tr}`,
    tr ? `A${tr},${tr} 0 0 1 ${width},${tr}` : "",
    `V${height - br}`,
    br ? `A${br},${br} 0 0 1 ${width - br},${height}` : "",
    `H${bl}`,
    bl ? `A${bl},${bl} 0 0 1 0,${height - bl}` : "",
    `V${tl}`,
    tl ? `A${tl},${tl} 0 0 1 ${tl},0` : "",
    "Z",
  ]
    .filter(Boolean)
    .join(" ")
}
