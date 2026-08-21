import {
  CARD_HEIGHT,
  CARD_RADIUS,
  CARD_WIDTH,
  COLUMNS,
  PAGE_HEIGHT,
  PAGE_PADDING,
  PAGE_WIDTH,
} from "../printer/page"

const mm = (value: number): string => `${value}mm`

export const embeddedStyles = `
:root {
  --page-width: ${mm(PAGE_WIDTH)};
  --page-height: ${mm(PAGE_HEIGHT)};
  --page-padding: ${mm(PAGE_PADDING)};
  --card-width: ${mm(CARD_WIDTH)};
  --card-height: ${mm(CARD_HEIGHT)};
  --card-radius: ${mm(CARD_RADIUS)};
  --columns: ${COLUMNS};
}

@page {
  size: ${mm(PAGE_WIDTH)} ${mm(PAGE_HEIGHT)};
  margin: 0;
}
`
