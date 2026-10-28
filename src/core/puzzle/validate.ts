import { intersect, offset, outers, totalArea, type Poly } from '../geometry/clip';
import { bounds, isSimple } from '../geometry/polygon';
import { signedArea } from '../geometry/polyline';

export type IssueKind =
  | 'not-simple'
  | 'overlap'
  | 'gap-too-small'
  | 'outside-plate'
  | 'too-small'
  | 'thin-feature'
  | 'fewer-pieces';

export interface Issue {
  kind: IssueKind;
  /** Errors make the puzzle unprintable as is; warnings are worth telling the user about. */
  severity: 'error' | 'warning';
  /** Index of the piece (or the first of a pair) the issue is about; -1 for the whole puzzle. */
  piece: number;
  other?: number;
  message: string;
}

export interface Limits {
  /** Intended gap between neighbouring pieces (mm). */
  clearance: number;
  /** Thinnest part of a piece that will print reliably (mm). */
  minFeature: number;
  /** Smallest worthwhile piece (mm squared). */
  minPieceArea: number;
  /** Side of the square the whole puzzle must fit inside (mm). */
  plateSize: number;
  /** Number of pieces the user asked for. */
  requested: number;
}

const OVERLAP_MM2 = 1e-3;
/** A piece may lose this fraction of its area to "too thin to print" before we warn. */
const THIN_FRACTION = 0.02;

/** Checks everything a printed puzzle needs. Pure: takes pieces in millimetres, returns issues. */
export function validatePuzzle(pieces: readonly Poly[], limits: Limits): Issue[] {
  const issues: Issue[] = [];
  const add = (issue: Issue): void => void issues.push(issue);
  const half = limits.plateSize / 2;

  pieces.forEach((p, i) => {
    if (!isSimple(p)) {
      add({
        kind: 'not-simple',
        severity: 'error',
        piece: i,
        message: `Piece ${i + 1} crosses itself.`,
      });
    }
    const b = bounds(p);
    if (b.minX < -half || b.maxX > half || b.minY < -half || b.maxY > half) {
      add({
        kind: 'outside-plate',
        severity: 'error',
        piece: i,
        message: `Piece ${i + 1} is off the print plate.`,
      });
    }
    const area = signedArea(p);
    if (area < limits.minPieceArea * 0.5) {
      add({
        kind: 'too-small',
        severity: 'warning',
        piece: i,
        message: `Piece ${i + 1} is very small.`,
      });
    }
    // Opening: anything thinner than minFeature disappears when shrunk and regrown.
    const opened = outers(offset(offset([p], -limits.minFeature / 2), limits.minFeature / 2));
    if (area - totalArea(opened) > THIN_FRACTION * area) {
      add({
        kind: 'thin-feature',
        severity: 'warning',
        piece: i,
        message: `Piece ${i + 1} has a very thin part.`,
      });
    }
  });

  const boxes = pieces.map((p) => bounds(p));
  const near = limits.clearance;
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      if (a.maxX + near < b.minX || b.maxX + near < a.minX) continue;
      if (a.maxY + near < b.minY || b.maxY + near < a.minY) continue;

      if (totalArea(intersect([pieces[i]!], [pieces[j]!])) > OVERLAP_MM2) {
        add({
          kind: 'overlap',
          severity: 'error',
          piece: i,
          other: j,
          message: `Pieces ${i + 1} and ${j + 1} overlap.`,
        });
        continue;
      }
      // If growing one piece by 90% of the clearance reaches the other, the gap is too small.
      const grown = offset([pieces[i]!], limits.clearance * 0.9);
      if (totalArea(intersect(grown, [pieces[j]!])) > OVERLAP_MM2) {
        add({
          kind: 'gap-too-small',
          severity: 'error',
          piece: i,
          other: j,
          message: `Pieces ${i + 1} and ${j + 1} are too close together.`,
        });
      }
    }
  }

  if (pieces.length < limits.requested) {
    add({
      kind: 'fewer-pieces',
      severity: 'warning',
      piece: -1,
      message: `Only ${pieces.length} pieces fit; you asked for ${limits.requested}.`,
    });
  }
  return issues;
}
