import { extrudePolygon, mergeMeshes, type Mesh, type Pocket, type Relief } from '../mesh/extrude';
import { MIN_FLOOR_MM } from '../puzzle/magnets';
import { meshesToStl } from '../mesh/stl';
import type { Puzzle } from '../puzzle/generate';
import { PUZZLE_THICKNESS_MM } from '../printer/a1mini';

/** A piece's pocket, or nothing when the puzzle is too thin to leave a floor under it. */
export function pocketFor(pocket: Pocket | null, thicknessMm: number): Pocket | undefined {
  return pocket && thicknessMm - pocket.depth >= MIN_FLOOR_MM ? pocket : undefined;
}

/** One closed solid per piece, thickness `thicknessMm`, sitting on z = 0 in the assembled layout. */
export function puzzleMeshes(
  puzzle: Puzzle,
  thicknessMm: number = PUZZLE_THICKNESS_MM,
  relief?: Relief,
): Mesh[] {
  return puzzle.pieces.map((p) =>
    extrudePolygon(p.polygon, thicknessMm, relief, pocketFor(p.pocket, thicknessMm)),
  );
}

/** The whole puzzle as one binary STL: every piece its own shell, in place with its gaps. */
export function puzzleStl(
  puzzle: Puzzle,
  thicknessMm: number = PUZZLE_THICKNESS_MM,
  relief?: Relief,
): Uint8Array {
  return meshesToStl([mergeMeshes(puzzleMeshes(puzzle, thicknessMm, relief))]);
}
