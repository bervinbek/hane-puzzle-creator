export const MIN_PIECES = 2;
/** Sixteen: fewer, bigger pieces for ages 5 to 16, each with room for its magnet (D-045). */
export const MAX_PIECES = 16;
export const DEFAULT_PIECES = 6;
/** The most letters in an animal's name. */
export const MAX_NAME = 30;

export interface Filament {
  id: 'gold' | 'tan' | 'white';
  /** The colour's name, used in the count line: colour is never the only signal. */
  name: string;
  hex: string;
}

/** The three filaments every puzzle is printed in. Gold is a silk filament (drawn with a sheen). */
export const FILAMENTS: readonly Filament[] = [
  { id: 'gold', name: 'Gold', hex: '#E0A82E' },
  { id: 'tan', name: 'Tan', hex: '#E6C7AA' },
  { id: 'white', name: 'White', hex: '#FFFFFF' },
];

/** Rounds to a whole number inside the allowed range; falls back to the default for NaN. */
export function clampPieces(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_PIECES;
  return Math.min(MAX_PIECES, Math.max(MIN_PIECES, Math.round(n)));
}
