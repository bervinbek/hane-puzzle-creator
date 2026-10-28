# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

**M0 scaffold is done** (Vite + strict TypeScript, Vitest, Playwright, ESLint/Prettier, a three-step UI shell, the A1 mini constants module, and the Pages workflow). Nothing functional exists yet: the image pipeline, geometry, viewer and printer model are milestones M1-M6 in [tasks/todo.md](tasks/todo.md). Three.js and the geometry libraries (d3-delaunay, earcut, a Clipper2 port, fflate) are not installed yet; add each when its milestone needs it.

## What this is

A static, client-side website (deployed to GitHub Pages) that converts a student's drawn animal outline into a 3D-printable jigsaw puzzle: clean up the outline, split it into N interlocking pieces (tabs/blanks), add print clearance, extrude to 3 mm, export STL sized for a **Bambu Lab A1 mini** (180 × 180 × 180 mm build volume, 0.4 mm nozzle), and show a realistic 3D render of the puzzle printing on an A1 mini. Audience: teachers and students aged 5-16.

Read before starting any task: [docs/PRD.md](docs/PRD.md) (what/why), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (how), [docs/DECISIONS.md](docs/DECISIONS.md) (settled choices), [docs/OPEN_QUESTIONS.md](docs/OPEN_QUESTIONS.md) (unsettled, with the defaults to build against). Visual rules: [docs/DESIGN.md](docs/DESIGN.md). The printer-model task: [docs/PRINTER_MODEL.md](docs/PRINTER_MODEL.md).

## Commands

```bash
npm install
npm run dev                          # Vite dev server
npm run build                        # tsc --noEmit, then static output in dist/
npm run typecheck                    # tsc --noEmit only
npm run lint                         # ESLint + Prettier check (npm run format to fix)
npm test                             # Vitest, all unit/property tests (src/**/*.test.ts, tests/**/*.test.ts)
npx vitest run path/to/file.test.ts  # single test file
npx vitest run -t "test name"        # single test by name
npx playwright install chromium      # once, before the first e2e run
npm run test:e2e                     # Playwright smoke test; builds and serves dist/ on :4173
```

Unit tests sit next to the code (`foo.ts` / `foo.test.ts`); Playwright specs live in `e2e/`. Set `BASE_PATH=/<repo>/` when building for Pages (CI does this); default is `/`. ESLint forbids DOM globals and `render/`, `ui/`, `three` imports inside `src/core/`.

## Architecture (the parts that span files)

Pipeline: image → preprocess → silhouette → trace/smooth → **Outline (mm)** → partition (Voronoi) → tabs → clearance → validate → **Puzzle (2D pieces, mm)** → extrude 3 mm → STL; the same `Puzzle` also feeds the Three.js viewer and the print simulation. Stages in `src/core/` are pure TypeScript with no DOM access and run in a Web Worker; `src/render/` is the only place that touches Three.js.

Invariants that are easy to break:

- **Units are mm everywhere in `core/`; Z is up; the puzzle lies in XY, centred on the origin, bottom at Z = 0.** Three.js is Y-up: convert in `render/` only, never in `core/`.
- **Determinism:** all randomness comes from the seeded PRNG in `core/rng.ts`. Same image + settings + seed must produce byte-identical STL.
- **Printer constants** (bed 180³, plate margin, nozzle, layer height) live in one module, `core/printer/a1mini.ts`. Do not hard-code them elsewhere.
- **Clearance** is done by pre-growing the outline by c/2 and insetting every piece by c/2 (default c = 0.3 mm), so the outer silhouette stays true to the drawing.
- **Tabs** are built on the _shared edge polyline_: one piece gets the knob, its neighbour gets the same polyline reversed, so the two always match. A tab that would leave either piece or violate the minimum wall must be dropped.
- **Voronoi on concave silhouettes** can split a cell into disconnected fragments (thin legs, tails). Handle by merging fragments into the neighbour with the longest shared border; never emit a multi-part piece.
- **The print simulation is illustrative, not a slicer.** The A1 mini is a bed-slinger: bed moves in Y, toolhead in X, gantry in Z. Pieces are parented to the build plate so they ride with the bed.
- **Privacy:** drawings are of minors and must never leave the browser (no uploads, no analytics that capture images).
- **GitHub Pages:** Vite `base` comes from an env var (`/<repo>/` in CI), no client-side routing, fonts and 3D assets self-hosted.
- **Printer model:** original procedural asset built from public dimensions; do not use the Bambu logo or copied CAD.

## Working in this repo

- The workflow rules in the parent `Desktop/CLAUDE.md` apply here. Per those rules, the plan and progress live in `tasks/todo.md` (tick items as they complete, add a Review section) and corrections go in `tasks/lessons.md`.
- Record any new architectural choice or reversal in `docs/DECISIONS.md`; move answered items out of `docs/OPEN_QUESTIONS.md`.
- Done means verified: geometry changes need the property tests (valid, non-overlapping, manifold shells, fits the plate) passing, and anything affecting fit/clearance needs a real print on the A1 mini before it is called finished.
