import { A1_MINI, PUZZLE_THICKNESS_MM } from '../printer/a1mini';
import { bounds } from '../geometry/polygon';
import type { Puzzle } from './generate';

/** PLA density in grams per cubic centimetre. */
export const PLA_DENSITY = 1.24;

/**
 * Rough print-time model for a 3 mm solid-ish part on an A1 mini. Averages over slow outer walls,
 * fast infill, corners and travel moves. These numbers are an estimate and should be calibrated
 * against a Bambu Studio slice of a real puzzle (see tasks/todo.md, M3).
 */
export const TIME_MODEL = {
  /** Average volume of plastic laid down per second (mm cubed per second). */
  flowMm3PerSecond: 9,
  /** Layer change, z hop and acceleration (seconds per layer). */
  secondsPerLayer: 2,
  /** Travel and retraction when the nozzle moves to another piece (seconds per piece per layer). */
  secondsPerPiecePerLayer: 0.3,
  /** Heating, bed levelling and purge before the first layer (seconds). */
  setupSeconds: 240,
} as const;

/** The puzzle is printed once in each of white, tan and gold. */
export const PRINT_SETS = 3;

export interface PrintReport {
  pieceCount: number;
  tabCount: number;
  widthMm: number;
  heightMm: number;
  thicknessMm: number;
  layers: number;
  /** Plan area of all pieces together (mm squared). */
  areaMm2: number;
  volumeMm3: number;
  /** Filament if every layer were solid. Real slicer settings use less. */
  gramsAtMost: number;
  /** Estimated print time for one set, rounded to five minutes. */
  minutes: number;
  /** Pieces that have a magnet pocket, and the magnets needed for every print together. */
  magnetCount: number;
  totalMagnets: number;
  /** How many times the puzzle is printed. */
  sets: number;
  /** Plastic and time for all the sets together. */
  totalGramsAtMost: number;
  totalMinutes: number;
}

/** Size, material and time estimates for a puzzle printed at the given thickness. */
export function printReport(
  puzzle: Puzzle,
  thicknessMm: number = PUZZLE_THICKNESS_MM,
  sets: number = PRINT_SETS,
): PrintReport {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const piece of puzzle.pieces) {
    const b = bounds(piece.polygon);
    minX = Math.min(minX, b.minX);
    maxX = Math.max(maxX, b.maxX);
    minY = Math.min(minY, b.minY);
    maxY = Math.max(maxY, b.maxY);
  }
  const areaMm2 = puzzle.pieces.reduce((s, p) => s + p.areaMm2, 0);
  const volumeMm3 = areaMm2 * thicknessMm;
  const layers = Math.round(thicknessMm / A1_MINI.layerHeight);
  const seconds =
    volumeMm3 / TIME_MODEL.flowMm3PerSecond +
    layers *
      (TIME_MODEL.secondsPerLayer + TIME_MODEL.secondsPerPiecePerLayer * puzzle.pieces.length) +
    TIME_MODEL.setupSeconds;

  const minutes = Math.round(seconds / 60 / 5) * 5;
  const magnetCount = puzzle.pieces.filter((p) => p.pocket !== null).length;

  return {
    pieceCount: puzzle.pieces.length,
    tabCount: puzzle.tabCount,
    widthMm: puzzle.pieces.length > 0 ? maxX - minX : 0,
    heightMm: puzzle.pieces.length > 0 ? maxY - minY : 0,
    thicknessMm,
    layers,
    areaMm2,
    volumeMm3,
    gramsAtMost: (volumeMm3 / 1000) * PLA_DENSITY,
    minutes,
    magnetCount,
    totalMagnets: magnetCount * sets,
    sets,
    totalGramsAtMost: (volumeMm3 / 1000) * PLA_DENSITY * sets,
    totalMinutes: minutes * sets,
  };
}

/** "about 50 min" or "about 1 h 5 min". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `about ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `about ${h} h` : `about ${h} h ${m} min`;
}
