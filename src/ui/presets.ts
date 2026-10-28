export const MIN_PIECES = 2;
export const MAX_PIECES = 60;
export const DEFAULT_PIECES = 6;

export type DifficultyId = 'easy' | 'medium' | 'tricky';

export interface Difficulty {
  id: DifficultyId;
  label: string;
  pieces: number;
}

/** Starting counts for each difficulty. Open question Q5 in docs/OPEN_QUESTIONS.md. */
export const DIFFICULTIES: readonly Difficulty[] = [
  { id: 'easy', label: 'Easy', pieces: 6 },
  { id: 'medium', label: 'Medium', pieces: 12 },
  { id: 'tricky', label: 'Tricky', pieces: 24 },
];

/** Above this many pieces we warn that pieces get small and fiddly to print and hold. */
export const MANY_PIECES = 40;

export type TeamId = 'yellow' | 'blue' | 'tan' | 'brown' | 'red';

export interface Team {
  id: TeamId;
  name: string;
  hex: string;
}

/** The five team colours from the rollout slide. Hex values are proposals. */
export const TEAMS: readonly Team[] = [
  { id: 'yellow', name: 'Yellow', hex: '#F2B91B' },
  { id: 'blue', name: 'Blue', hex: '#27B3E8' },
  { id: 'tan', name: 'Tan', hex: '#E6C7AA' },
  { id: 'brown', name: 'Brown', hex: '#7A3F1D' },
  { id: 'red', name: 'Red', hex: '#D8261C' },
];

/** Rounds to a whole number inside the allowed range; falls back to the default for NaN. */
export function clampPieces(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_PIECES;
  return Math.min(MAX_PIECES, Math.max(MIN_PIECES, Math.round(n)));
}

/** Which difficulty chip is selected for a given piece count. */
export function difficultyFor(pieces: number): DifficultyId {
  if (pieces <= 8) return 'easy';
  if (pieces <= 16) return 'medium';
  return 'tricky';
}
