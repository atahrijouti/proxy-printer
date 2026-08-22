const PX_PER_MM = 16
const PT_PER_MM = 72 / 25.4

export const pixelsFromMm = (mm: number): number => mm * PX_PER_MM
export const pointsFromMm = (mm: number): number => mm * PT_PER_MM
