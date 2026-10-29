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

/** A file name safe on every system: lower case letters, digits and dashes. */
export function safeName(parts: readonly (string | number)[]): string {
  return parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
