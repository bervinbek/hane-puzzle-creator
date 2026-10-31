import type { Poly } from '../geometry/clip';
import { MIN_ENGRAVE_FLOOR_MM } from '../mesh/engrave';
import {
  extrudePolygon,
  mergeMeshes,
  type Mesh,
  type Pocket,
  type Relief,
  type TopCut,
} from '../mesh/extrude';
import { MIN_FLOOR_MM } from '../puzzle/magnets';
import { meshesToStl } from '../mesh/stl';
import type { Puzzle } from '../puzzle/generate';
import { ENGRAVE, PUZZLE_THICKNESS_MM } from '../printer/a1mini';

/** A piece's pocket, or nothing when the puzzle is too thin to leave a floor under it. */
export function pocketFor(pocket: Pocket | null, thicknessMm: number): Pocket | undefined {
  return pocket && thicknessMm - pocket.depth >= MIN_FLOOR_MM ? pocket : undefined;
}

/**
 * A piece's grooves at the depth asked for, or nothing when it has none, the depth is zero, or the
 * piece is too thin to leave a solid slab under them.
 */
export function engravingFor(
  grooves: readonly Poly[],
  thicknessMm: number,
  depthMm: number,
): TopCut | undefined {
  const depth = Math.min(depthMm, ENGRAVE.maxDepthMm);
  if (grooves.length === 0 || depth <= 0 || thicknessMm - depth < MIN_ENGRAVE_FLOOR_MM) {
    return undefined;
  }
  return { rings: grooves, depth };
}

/** One closed solid per piece, thickness `thicknessMm`, sitting on z = 0 in the assembled layout. */
export function puzzleMeshes(
  puzzle: Puzzle,
  thicknessMm: number = PUZZLE_THICKNESS_MM,
  relief?: Relief,
  engraveDepthMm: number = ENGRAVE.depthMm,
): Mesh[] {
  return puzzle.pieces.map((p) =>
    extrudePolygon(
      p.polygon,
      thicknessMm,
      relief,
      pocketFor(p.pocket, thicknessMm),
      engravingFor(p.grooves, thicknessMm, engraveDepthMm),
    ),
  );
}

/** The whole puzzle as one binary STL: every piece its own shell, in place with its gaps. */
export function puzzleStl(
  puzzle: Puzzle,
  thicknessMm: number = PUZZLE_THICKNESS_MM,
  relief?: Relief,
  engraveDepthMm: number = ENGRAVE.depthMm,
): Uint8Array {
  return meshesToStl([mergeMeshes(puzzleMeshes(puzzle, thicknessMm, relief, engraveDepthMm))]);
}
