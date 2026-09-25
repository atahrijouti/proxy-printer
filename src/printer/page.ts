export const CARD_WIDTH = 63
export const CARD_HEIGHT = 88
export const CARD_RADIUS = 2

export const PAGE_WIDTH = 210
export const PAGE_HEIGHT = 297
export const PAGE_PADDING = 10
export const COLUMNS = 3
export const ROWS = 3
export const CARDS_PER_PAGE = COLUMNS * ROWS

const PX_PER_MM = 16
const PT_PER_MM = 72 / 25.4

export const pixelsFromMm = (mm: number): number => mm * PX_PER_MM
export const pointsFromMm = (mm: number): number => mm * PT_PER_MM
