import { difference, intersect, offset, union, type Poly } from '../geometry/clip';
import { bounds, pointInPolygon } from '../geometry/polygon';
import { signedArea, simplifyClosed } from '../geometry/polyline';
import { pocketRing, type Pocket } from '../mesh/extrude';
import { ENGRAVE } from '../printer/a1mini';

/** Rings of marks drawn inside the animal, in millimetres, and how wide the pen was in them. */
export interface Marks {
  rings: Poly[];
  penMm: number;
}

/** Marks scaled about the origin, the way the outline was when it was fitted to a smaller plate. */
export function scaleMarks(marks: Marks, factor: number): Marks {
  return {
    rings: marks.rings.map((r) => r.map(([x, y]) => [x * factor, y * factor])),
    penMm: marks.penMm * factor,
  };
}

/** Counter-clockwise outers and clockwise holes, from how the rings sit inside each other. */
function orientByNesting(rings: readonly Poly[]): Poly[] {
  return rings.map((r, i) => {
    const [px, py] = r[0]!;
    let level = 0;
    rings.forEach((other, j) => {
      if (i !== j && pointInPolygon(px, py, other)) level++;
    });
    const ccw = signedArea(r) > 0;
    return ccw === (level % 2 === 0) ? r : [...r].reverse();
  });
}

/** Drops zero-area dust and specks, and the zigzags integer rounding leaves in a curve. */
function tidy(polys: readonly Poly[]): Poly[] {
  return polys
    .map((p) => simplifyClosed(p, 0.02))
    .filter((p) => p.length >= 3 && Math.abs(signedArea(p)) >= ENGRAVE.minAreaMm2);
}

/** Opening takes away anything narrower than `width`; closing fills gaps narrower than it. */
const opened = (polys: readonly Poly[], width: number): Poly[] =>
  offset(offset(polys, -width / 2), width / 2);
const closed = (polys: readonly Poly[], width: number): Poly[] =>
  offset(offset(polys, width / 2), -width / 2);

/**
 * The marks as the grooves would be on the whole animal: every line the same width, whatever the
 * pen was after the drawing was scaled to the plate (a small drawing blown up four times would
 * otherwise get grooves 8 mm wide). Thick marks are thinned and thin ones widened by half the
 * difference each side; marks closer together than the narrowest groove are joined, because the
 * sliver of top face between them would be too thin to print.
 */
export function normaliseMarks(marks: Marks): Poly[] {
  const rings = marks.rings.filter((r) => r.length >= 3 && Math.abs(signedArea(r)) > 1e-6);
  if (rings.length === 0) return [];
  const solid = union(orientByNesting(rings), []);
  // A dot (an eye) is as wide as the pen and no longer: thinned to a line's width it would be a
  // pinprick, so it keeps its size up to `dotMm`.
  const isDot = (r: Poly): boolean => {
    if (signedArea(r) <= 0) return false;
    const b = bounds(r);
    return (
      Math.max(b.maxX - b.minX, b.maxY - b.minY) <= 2 * marks.penMm &&
      !solid.some((o) => o !== r && pointInPolygon(o[0]![0], o[0]![1], r))
    );
  };
  const dots = solid.filter(isDot);
  const lines = solid.filter((r) => !dots.includes(r));
  const grow = (polys: Poly[], width: number): Poly[] => {
    const delta = (width - marks.penMm) / 2;
    return Math.abs(delta) > 0.005 ? offset(polys, delta) : polys;
  };
  const dotWidth = Math.max(ENGRAVE.widthMm, Math.min(marks.penMm, ENGRAVE.dotMm));
  return tidy(
    closed(union(grow(lines, ENGRAVE.widthMm), grow(dots, dotWidth)), ENGRAVE.minWidthMm),
  );
}

/**
 * The grooves for one piece: the normalised marks kept inside the piece, clear of its edge (so of
 * every tab and cut) and of its magnet pocket, with anything left thinner than the narrowest
 * groove and any speck taken away. A groove stops short of a cut and starts again on the
 * neighbour, as D-053 says. Rings come out with holes nested inside them.
 */
export function grooveRings(marks: readonly Poly[], piece: Poly, pocket: Pocket | null): Poly[] {
  if (marks.length === 0) return [];
  const room = offset([piece], -ENGRAVE.edgeMarginMm);
  if (room.length === 0) return [];
  let cut = intersect(marks, room);
  if (pocket) cut = difference(cut, offset([pocketRing(pocket)], ENGRAVE.pocketMarginMm));
  return tidy(opened(cut, ENGRAVE.minWidthMm));
}
