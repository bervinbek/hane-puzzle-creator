import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PIECES,
  DIFFICULTIES,
  MAX_PIECES,
  MIN_PIECES,
  FILAMENTS,
  clampPieces,
  difficultyFor,
} from './presets';

describe('clampPieces', () => {
  it('keeps values inside the allowed range', () => {
    expect(clampPieces(0)).toBe(MIN_PIECES);
    expect(clampPieces(1000)).toBe(MAX_PIECES);
    expect(clampPieces(12)).toBe(12);
  });

  it('rounds to a whole number and handles NaN', () => {
    expect(clampPieces(7.6)).toBe(8);
    expect(clampPieces(Number.NaN)).toBe(DEFAULT_PIECES);
  });
});

describe('difficultyFor', () => {
  it('maps each preset count back to its own difficulty', () => {
    for (const d of DIFFICULTIES) expect(difficultyFor(d.pieces)).toBe(d.id);
  });

  it('uses range boundaries between presets', () => {
    expect(difficultyFor(8)).toBe('easy');
    expect(difficultyFor(9)).toBe('medium');
    expect(difficultyFor(16)).toBe('medium');
    expect(difficultyFor(17)).toBe('tricky');
  });
});

describe('FILAMENTS', () => {
  it('has three uniquely named colours: gold, tan and white', () => {
    expect(FILAMENTS.map((f) => f.id)).toEqual(['gold', 'tan', 'white']);
    expect(new Set(FILAMENTS.map((f) => f.name)).size).toBe(3);
  });
});
