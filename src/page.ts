import { CARD_HEIGHT_MM, CARD_RADIUS_MM, CARD_WIDTH_MM } from "./card"

export const PAGE_WIDTH_MM = 210
export const PAGE_HEIGHT_MM = 297
export const MARGIN_MM = 10
export const COLUMNS = 3
export const ROWS = 3
export const CARDS_PER_PAGE = COLUMNS * ROWS

const mm = (value: number): string => `${value}mm`

export const documentStyle = {
  "--page-width": mm(PAGE_WIDTH_MM),
  "--page-height": mm(PAGE_HEIGHT_MM),
  "--page-margin": mm(MARGIN_MM),
  "--card-width": mm(CARD_WIDTH_MM),
  "--card-height": mm(CARD_HEIGHT_MM),
  "--card-radius": mm(CARD_RADIUS_MM),
  "--columns": String(COLUMNS),
}
