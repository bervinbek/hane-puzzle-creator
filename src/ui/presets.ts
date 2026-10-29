export const MIN_PIECES = 2;
export const MAX_PIECES = 60;
export const DEFAULT_PIECES = 6;

/** Above this many pieces we warn that pieces get small and fiddly to print and hold. */
export const MANY_PIECES = 40;

export interface Filament {
  id: 'gold' | 'tan' | 'white';
  /** The colour's name, used in the count line: colour is never the only signal. */
  name: string;
  hex: string;
}

/** The three filaments every puzzle is printed in. Gold is a glossy (silk) filament. */
export const FILAMENTS: readonly Filament[] = [
  { id: 'gold', name: 'Gold (glossy)', hex: '#E0A82E' },
  { id: 'tan', name: 'Tan', hex: '#E6C7AA' },
  { id: 'white', name: 'White', hex: '#FFFFFF' },
];

/** Rounds to a whole number inside the allowed range; falls back to the default for NaN. */
export function clampPieces(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_PIECES;
  return Math.min(MAX_PIECES, Math.max(MIN_PIECES, Math.round(n)));
}
