import { describe, expect, it } from 'vitest';
import { DEFAULT_PIECES, MAX_PIECES, MIN_PIECES, FILAMENTS, clampPieces } from './presets';

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

describe('FILAMENTS', () => {
  it('has three uniquely named colours: gold, tan and white', () => {
    expect(FILAMENTS.map((f) => f.id)).toEqual(['gold', 'tan', 'white']);
    expect(new Set(FILAMENTS.map((f) => f.name)).size).toBe(3);
  });
});
