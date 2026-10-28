# Architecture

> Status: planned design (no code yet). Update this file as decisions land; record reversals in [DECISIONS.md](DECISIONS.md).

## 1. Shape of the system

100% client-side single-page app. Heavy geometry work runs in a **Web Worker** so the UI stays responsive on school hardware. No backend. Deployed as static files to GitHub Pages.

```
image / sketch ──► [1 preprocess] ──► [2 silhouette] ──► [3 trace+smooth] ──► Outline (mm)
                                                                                 │
        ┌────────────────────────────────────────────────────────────────────────┘
        ▼
  [4 partition] ──► [5 tabs] ──► [6 clearance] ──► [7 validate] ──► Puzzle (2D pieces, mm)
                                                                        │
                       ┌────────────────────────────┬───────────────────┤
                       ▼                            ▼                   ▼
                [8 extrude 3 mm]            [10 print-sim path]   [report: area, time, grams]
                       │                            │
                       ▼                            ▼
                [9 STL / 3MF export]        [11 Three.js scene: A1 mini + pieces]
```

Stages 1-8 are **pure TypeScript with no DOM access** (they take and return plain data), so they run in a worker and are unit-testable in Node.

## 2. Planned stack

| Concern                 | Choice                                                   | Notes                                                            |
| ----------------------- | -------------------------------------------------------- | ---------------------------------------------------------------- |
| Build                   | Vite + TypeScript (strict)                               | Static output in `dist/`. `base` set for the repo path on Pages. |
| UI                      | Vanilla TS + a tiny store, or Preact if state gets hairy | No heavy framework needed for three steps. Decide at M0.         |
| 3D                      | Three.js                                                 | Viewer, printer model, print simulation.                         |
| Polygon booleans/offset | Clipper2 (pure TS/WASM port, pick at M2)                 | Needed for clearance inset and clipping cells to the outline.    |
| Voronoi                 | `d3-delaunay`                                            | Fast, small.                                                     |
| Triangulation           | `earcut`                                                 | Polygon-with-holes to triangles for caps.                        |
| Zip                     | `fflate`                                                 | Per-piece STL bundle, later 3MF.                                 |
| Tests                   | Vitest (unit/property), Playwright (smoke + visual)      |                                                                  |
| Lint/format             | ESLint + Prettier                                        |                                                                  |
| CI/CD                   | GitHub Actions to Pages (`actions/deploy-pages`)         |                                                                  |

OpenCV.js is deliberately avoided (about 8 MB). The image pipeline is small enough to write directly.

## 3. Planned layout

```
src/
  core/            pure logic, worker-safe, no DOM
    image/         preprocess, threshold, morphology, perspective warp
    trace/         marching squares, simplify (RDP), smooth/resample
    puzzle/        seeds, voronoi partition, tabs, clearance, validate
    mesh/          extrude, STL writer, 3MF writer
    printer/       A1 mini constants, simple layer/toolpath generator for the sim
    rng.ts         seeded PRNG (determinism)
  workers/         worker entry points + typed message protocol
  render/          Three.js: viewer scene, printer model, print animation
  ui/              wizard steps, controls, sketch pad, report panel
  main.ts
tests/
  fixtures/drawings/   sample kid drawings (PNG) incl. nasty ones
docs/  tasks/  public/
```

## 4. Conventions that must hold across files

- **Units:** millimetres everywhere in `core/`. Pixels exist only inside `core/image` and `core/trace` until the explicit scale-to-mm step.
- **Axes:** the puzzle lies in the **XY plane, Z up**, centred on the origin in XY, bottom at Z = 0. This matches slicers and STL. Three.js is Y-up, so the conversion happens in exactly one place (`render/`). Never leak Y-up into `core/`.
- **Winding:** outer rings CCW, holes CW. STL normals point outward.
- **Determinism:** every random choice comes from a seeded PRNG (mulberry32). Same image + settings + seed produces byte-identical STL. The seed is part of the saved project.
- **Printer constants** live in one module (`core/printer/a1mini.ts`): build volume 180³, usable plate margin, nozzle 0.4, layer height 0.2, first layer 0.2.
- **Worker protocol:** typed request/response messages; cancel in-flight jobs when a slider moves (debounce + latest-wins).

## 5. The hard parts (read before touching them)

### 5.1 Outline from a kid's drawing

Drawings are open, wobbly, with glare and shadows. Pipeline: downscale, grayscale, divide by a heavily blurred copy (illumination normalisation), Otsu/adaptive threshold, morphological **close** to seal gaps, flood-fill from the border to get the exterior, invert to get the filled silhouette, keep the largest component, trace with marching squares, simplify, smooth, resample at about 0.5 mm spacing. Interior closed shapes (eyes) are filled by default (F-25 makes them optional).

### 5.2 Partition into N pieces

Seed points are chosen inside the silhouette (Poisson-disc or jittered area-weighted sampling, then 2-5 Lloyd relaxation steps for even areas), Voronoi cells are clipped to the outline. **Concave silhouettes break the naive approach**: a cell can be cut into disconnected fragments by a thin leg or tail. Detect multi-part cells, then merge small fragments into the neighbour sharing the longest border. Enforce a minimum piece area and re-seed or merge below it.

### 5.3 Tabs

Tabs are made with boolean operations, not by rewriting edge polylines. For each pair of neighbouring pieces the code finds their shared straight border (`sharedEdges`), builds a mushroom-shaped knob (neck, round head, filleted inside corners) at the middle of the border (two knobs, one each way, on borders over 45 mm), then **moves it from one piece to the other**: `owner = owner ∪ knob`, `receiver = receiver − knob`. Because the same knob is added to one piece and removed from the other, the two always match exactly and the pieces still tile the outline perfectly before the gap is applied.

A knob is tried at a few positions and sizes and dropped if (a) the knob grown by `minWall` (1.4 mm) would leave the two pieces' combined area, which keeps a wall of at least that thickness around it, or (b) either piece would split in two. Borders shorter than `minEdge` (12 mm) get no tab. Neck width is 22% of the border, between 3.2 and 5.2 mm. Which piece owns the knob comes from the seeded PRNG.

### 5.4 Clearance

The outline is grown by `c/2` first, everything above is done on the grown outline, then every finished piece is shrunk by `c/2` (`c` is the total gap, default 0.3 mm). The gap between neighbours is `c`, while the **outer silhouette stays true** to the drawing. Clipper (`clipper-lib`, integer micrometre coordinates) does the offsets with round joins. Shrinking leaves micrometre-scale zigzags at sharp tips, so `clean()` simplifies and re-unions each piece afterwards. The validator then checks every piece: single simple polygon, on the plate, at least `minPieceArea`, no part thinner than `minFeature` (an opening test), no overlaps, and a real gap of at least 90% of `c` between neighbours. Errors make the puzzle not ok; thin parts and "fewer pieces than asked for" are warnings.

### 5.5 Extrude and STL

Triangulate each piece polygon (earcut), build top and bottom caps and side walls, so each piece is a closed manifold shell. Binary STL, little-endian, mm, no date in the header (reproducible bytes). Export one STL with all pieces (each its own shell, laid out assembled with their clearance) and a zip of per-piece STLs. `checkMesh` proves each piece is closed (every directed edge has exactly one reverse), outward-facing (positive volume) and free of zero-area triangles; tests run it on every piece of many puzzles.

### 5.6 Print simulation (visual only)

The sim is **not a real slicer**. For each layer (15 at 0.2 mm), generate a plausible toolpath: 2 perimeters (offset 0.4 mm), then solid zig-zag infill, with a travel move between pieces. Playback maps nozzle target position (x, y, z) to the A1 mini rig: the **toolhead moves along X, the bed slides along Y, the gantry arm rises along Z**. Deposited material is revealed progressively (instanced segments or a growing layer mask). The real print is sliced in Bambu Studio.

## 6. Deployment to GitHub Pages

- `vite.config.ts`: `base` from an env var, `'/<repo-name>/'` in CI and `'/'` in dev. Prefer relative asset URLs and no client-side routing (no 404 fallback issue on Pages).
- Workflow: on push to `main`, `npm ci`, `npm run build`, upload `dist/` with `actions/upload-pages-artifact`, deploy with `actions/deploy-pages`. Pages source set to "GitHub Actions" in repo settings.
- Fonts and any 3D assets are self-hosted (classroom networks may block third-party CDNs).

## 7. Performance and device budget

Target: current Chrome/Edge/Safari/Firefox including iPad Safari and Chromebooks. Slider changes re-run only the stages they affect (cache by stage inputs). Piece generation target under 1 s for N = 30 on a mid-range laptop. Printer model under about 150k triangles; textures compressed.

## 8. Testing strategy

- **Unit:** each core stage with small synthetic inputs (circle, L-shape, thin-legged animal polygon).
- **Property tests:** for random seeds and N, assert pieces are valid, non-overlapping, union of pieces (plus gaps) covers the outline, total area within tolerance, every shell manifold.
- **Fixtures:** `tests/fixtures/drawings/` with real-ish kid drawings: easy, open outline, glare, thin lines, tiny drawing in a big frame.
- **Golden files:** STL checksum for a fixed seed to catch accidental changes.
- **E2E:** Playwright loads the built site, feeds a fixture, expects an STL download.
- **Physical:** printed acceptance run on a real A1 mini before 1.0 (M9).
