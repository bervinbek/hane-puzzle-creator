import type { Vec2 } from '../geometry/polygon';
import type { Relief } from '../mesh/extrude';
import { A1_MINI, usablePlateSize } from '../printer/a1mini';
import { DEFAULT_PUZZLE, type PuzzleParams } from './generate';
import { DEFAULT_TABS, type TabParams } from './tabs';

/**
 * What a teacher can change before printing. Children never need these: the defaults are the
 * ones used everywhere else. The same settings plus the same outline and seed always give the
 * same STL, so they are saved in a project file too.
 */

export type TabAmount = 'fewer' | 'standard' | 'more';

/** How much the first layer is pulled in at the bottom edge (F-23). Off unless a real print says it helps. */
export type ReliefAmount = 'off' | 'small' | 'medium';

export const RELIEF_AMOUNTS: readonly ReliefAmount[] = ['off', 'small', 'medium'];

/** The inset of the first layer for each amount (mm). */
export const RELIEF_INSET_MM = { small: 0.2, medium: 0.3 } as const;

export const TAB_AMOUNTS: readonly TabAmount[] = ['fewer', 'standard', 'more'];

export interface TeacherSettings {
  /** Total gap between neighbouring pieces (mm). */
  clearance: number;
  tabAmount: TabAmount;
  /** The longest side the puzzle may have (mm). A bigger drawing is scaled down to this. */
  maxSizeMm: number;
  /** Pulls the first layer in at the bottom edge so it does not swell and fuse pieces. */
  relief: ReliefAmount;
}

export const CLEARANCE_MM = { min: 0.15, max: 0.6, step: 0.05 } as const;
export const SIZE_MM = { min: 60, max: usablePlateSize(), step: 5 } as const;

export const DEFAULT_TEACHER: TeacherSettings = {
  clearance: DEFAULT_PUZZLE.clearance,
  tabAmount: 'standard',
  maxSizeMm: SIZE_MM.max,
  relief: 'off',
};

/** Standard is exactly the default, so unchanged settings give unchanged puzzles. */
const TABS: Record<TabAmount, TabParams> = {
  fewer: { ...DEFAULT_TABS, minEdge: 16, doubleAbove: 70 },
  standard: DEFAULT_TABS,
  more: { ...DEFAULT_TABS, minEdge: 6, doubleAbove: 22 },
};

/** The first-layer relief these settings ask for, or nothing when it is off. */
export function reliefFor(t: TeacherSettings): Relief | undefined {
  return t.relief === 'off'
    ? undefined
    : { inset: RELIEF_INSET_MM[t.relief], height: A1_MINI.layerHeight };
}

/** The parts of the puzzle settings that these options change. */
export function teacherParams(t: TeacherSettings): Pick<PuzzleParams, 'clearance' | 'tabs'> {
  return { clearance: t.clearance, tabs: TABS[t.tabAmount] };
}

const snap = (
  v: number,
  { min, max, step }: { min: number; max: number; step: number },
): number => {
  const clamped = Math.min(max, Math.max(min, v));
  // Round to the step, then to 2 decimals so 0.1 + 0.05 never shows up as 0.15000000000000002.
  return Number((Math.round(clamped / step) * step).toFixed(2));
};

/** Makes any value into valid settings: wrong types fall back to the default, numbers are clamped. */
export function sanitiseTeacher(raw: unknown): TeacherSettings {
  const d = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return {
    clearance: snap(num(d.clearance, DEFAULT_TEACHER.clearance), CLEARANCE_MM),
    tabAmount: TAB_AMOUNTS.includes(d.tabAmount as TabAmount)
      ? (d.tabAmount as TabAmount)
      : DEFAULT_TEACHER.tabAmount,
    maxSizeMm: snap(num(d.maxSizeMm, DEFAULT_TEACHER.maxSizeMm), SIZE_MM),
    relief: RELIEF_AMOUNTS.includes(d.relief as ReliefAmount)
      ? (d.relief as ReliefAmount)
      : DEFAULT_TEACHER.relief,
  };
}

export function isDefaultTeacher(t: TeacherSettings): boolean {
  return (
    t.clearance === DEFAULT_TEACHER.clearance &&
    t.tabAmount === DEFAULT_TEACHER.tabAmount &&
    t.maxSizeMm === DEFAULT_TEACHER.maxSizeMm &&
    t.relief === DEFAULT_TEACHER.relief
  );
}

/**
 * Scales a centred outline down so its longest side is at most `maxMm`. Never scales up. Returns
 * the factor used, so other points (like the eye) can follow.
 */
export function scaleToMax(
  points: readonly Vec2[],
  longestMm: number,
  maxMm: number,
): { points: readonly Vec2[]; factor: number } {
  if (longestMm <= maxMm + 1e-9 || longestMm <= 0) return { points, factor: 1 };
  const factor = maxMm / longestMm;
  return { points: points.map(([x, y]): Vec2 => [x * factor, y * factor]), factor };
}
