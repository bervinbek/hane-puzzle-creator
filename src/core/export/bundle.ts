import { zipSync } from 'fflate';
import { extrudePolygon, mergeMeshes, type Mesh, type Relief } from '../mesh/extrude';
import { meshesToStl } from '../mesh/stl';
import type { Puzzle } from '../puzzle/generate';
import { PUZZLE_THICKNESS_MM } from '../printer/a1mini';

/** One closed solid per piece, thickness `thicknessMm`, sitting on z = 0 in the assembled layout. */
export function puzzleMeshes(
  puzzle: Puzzle,
  thicknessMm: number = PUZZLE_THICKNESS_MM,
  relief?: Relief,
): Mesh[] {
  return puzzle.pieces.map((p) => extrudePolygon(p.polygon, thicknessMm, relief));
}

/** The whole puzzle as one binary STL: every piece its own shell, in place with its gaps. */
export function puzzleStl(
  puzzle: Puzzle,
  thicknessMm: number = PUZZLE_THICKNESS_MM,
  relief?: Relief,
): Uint8Array {
  return meshesToStl([mergeMeshes(puzzleMeshes(puzzle, thicknessMm, relief))]);
}

const README = `Hane Puzzle - one file per piece

Each .stl is a single puzzle piece, 3 mm thick, in millimetres.
The pieces keep their places in the finished puzzle, so opening all of them
together in Bambu Studio (or the single puzzle .stl) gives the assembled layout
with a small gap between pieces.

To print: open the file in Bambu Studio, choose the A1 mini and PLA, use 0.2 mm
layer height, and slice. Check the preview before you print.
`;

/** Every piece as its own STL, plus a short readme, in one zip. Files are named `<base>-piece-01.stl` etc. */
export function piecesZip(
  puzzle: Puzzle,
  baseName: string,
  thicknessMm: number = PUZZLE_THICKNESS_MM,
  relief?: Relief,
): Uint8Array {
  const files: Record<string, Uint8Array> = { 'README.txt': new TextEncoder().encode(README) };
  const width = Math.max(2, String(puzzle.pieces.length).length);
  puzzleMeshes(puzzle, thicknessMm, relief).forEach((mesh, i) => {
    const number = String(i + 1).padStart(width, '0');
    files[`${baseName}-piece-${number}.stl`] = meshesToStl([mesh]);
  });
  // A fixed timestamp keeps the zip identical from run to run.
  return zipSync(files, { mtime: new Date('2026-01-01T00:00:00Z') });
}

/** A file name safe on every system: lower case letters, digits and dashes. */
export function safeName(parts: readonly (string | number)[]): string {
  return parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
