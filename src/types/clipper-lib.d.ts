/* eslint-disable @typescript-eslint/no-unused-vars -- these declarations are only referenced through `typeof` below */
/** Minimal typings for the parts of clipper-lib (Clipper 6) that src/core/geometry/clip.ts uses. */
declare module 'clipper-lib' {
  interface IntPoint {
    X: number;
    Y: number;
  }
  type Path = IntPoint[];
  class Paths extends Array<Path> {}

  class Clipper {
    constructor(initOptions?: number);
    AddPaths(paths: Path[], polyType: number, closed: boolean): boolean;
    Execute(clipType: number, solution: Paths, subjFillType: number, clipFillType: number): boolean;
  }

  class ClipperOffset {
    constructor(miterLimit?: number, arcTolerance?: number);
    AddPaths(paths: Path[], joinType: number, endType: number): void;
    Execute(solution: Paths, delta: number): void;
  }

  const ClipperLib: {
    Clipper: typeof Clipper;
    ClipperOffset: typeof ClipperOffset;
    Paths: typeof Paths;
    PolyType: { ptSubject: number; ptClip: number };
    ClipType: { ctIntersection: number; ctUnion: number; ctDifference: number; ctXor: number };
    PolyFillType: {
      pftEvenOdd: number;
      pftNonZero: number;
      pftPositive: number;
      pftNegative: number;
    };
    JoinType: { jtSquare: number; jtRound: number; jtMiter: number };
    EndType: { etClosedPolygon: number };
  };
  export default ClipperLib;
}
