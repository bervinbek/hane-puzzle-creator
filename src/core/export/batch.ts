import { zipSync } from 'fflate';
import { puzzleForProject, serializeProject, type Project } from '../project';
import type { Puzzle } from '../puzzle/generate';
import { reliefFor } from '../puzzle/settings';
import { puzzleStl, safeName } from './bundle';

/**
 * A class batch: one zip with a puzzle for every team. Each puzzle is made again from its saved
 * project, exactly as the Print step would make it, so the file is the same one the team would
 * have downloaded on its own.
 */

export interface BatchSkipped {
  name: string;
  reason: string;
}

export interface BatchResult {
  bytes: Uint8Array;
  /** File names (without extension) of the puzzles in the zip, in order. */
  included: string[];
  /** Puzzles that could not be made, and why. They are left out of the zip. */
  skipped: BatchSkipped[];
}

/** The most puzzles one batch holds. A class has a handful of teams; this keeps the zip quick to make. */
export const MAX_BATCH = 20;

/** "fish-8-pieces", with -2, -3 for repeats, so no two files share a name. */
export function batchNames(projects: readonly Project[], base: string): string[] {
  const seen = new Map<string, number>();
  return projects.map((p) => {
    const name = safeName([base, p.name, p.pieces, 'pieces']);
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return n === 1 ? name : `${name}-${n}`;
  });
}

const README = `Hane Puzzle - a class batch

Each puzzle has two files:
  <name>.stl            the whole puzzle, 3 mm thick, ready for Bambu Studio
  projects/<name>.json  the saved project, to open again in the Hane Puzzle page

Open the .stl in Bambu Studio, choose the A1 mini and PLA, use 0.2 mm layer height, and slice.
Check the preview before you print.
`;

export function batchZip(projects: readonly Project[], base = 'hane-puzzle'): BatchResult {
  const names = batchNames(projects, base);
  const files: Record<string, Uint8Array> = { 'README.txt': new TextEncoder().encode(README) };
  const included: string[] = [];
  const skipped: BatchSkipped[] = [];
  projects.forEach((project, i) => {
    const name = names[i]!;
    let puzzle: Puzzle;
    try {
      puzzle = puzzleForProject(project);
    } catch {
      skipped.push({ name, reason: 'The shape could not be cut.' });
      return;
    }
    const error = puzzle.issues.find((issue) => issue.severity === 'error');
    if (!puzzle.ok || puzzle.pieces.length === 0) {
      skipped.push({ name, reason: error?.message ?? 'No pieces could be made.' });
      return;
    }
    files[`${name}.stl`] = puzzleStl(puzzle, undefined, reliefFor(project.settings));
    files[`projects/${name}.json`] = new TextEncoder().encode(serializeProject(project));
    included.push(name);
  });
  // A fixed timestamp keeps the zip identical from run to run.
  return {
    bytes: zipSync(files, { mtime: new Date('2026-01-01T00:00:00Z') }),
    included,
    skipped,
  };
}
