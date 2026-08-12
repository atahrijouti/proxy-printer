// The printer owns the frame (docs/goal.md): card geometry, page, and grid. The DB
// fills only each card's interior — it no longer carries card size or radius.

export const CARD_WIDTH_MM = 63
export const CARD_HEIGHT_MM = 88
export const CARD_RADIUS_MM = 2

export const CARDS_PER_PAGE = 9 // 3×3 grid
