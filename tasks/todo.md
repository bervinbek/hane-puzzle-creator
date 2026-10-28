# Roadmap and Progress

Legend: `[ ]` todo · `[x]` done. Update as work completes. Add a dated Review entry at the bottom of each finished milestone.

Last updated: 2026-10-28

## M-1: Planning (this session)

- [x] Analyse the rollout slide and requirements
- [x] Verify A1 mini build volume, nozzle, AMS lite, dimensions (sources in docs/PRINTER_MODEL.md)
- [x] Write PRD, ARCHITECTURE, DESIGN, PRINTER_MODEL, DECISIONS, OPEN_QUESTIONS
- [x] Write CLAUDE.md, README.md
- [ ] **Answer the top open questions (Q1-Q5) in docs/OPEN_QUESTIONS.md**
- [ ] Plan check-in with a subagent before starting M0 (per workflow rules)

## M0: Scaffold and deploy

- [x] Create Vite + TypeScript (strict) project, ESLint, Prettier, Vitest, Playwright
- [x] Folder layout per ARCHITECTURE.md section 3 (only `core/printer`, `ui`, `styles` exist so far; the rest is created per milestone)
- [x] Self-hosted fonts (via @fontsource), design tokens (DESIGN.md section 2), empty three-step shell
- [x] `base` via `BASE_PATH` env var
- [x] CI workflow written: lint, test, build, e2e, deploy (`.github/workflows/deploy.yml`)
- [x] Replace "Planned commands" in CLAUDE.md with the real ones
- [x] Verified locally: lint, typecheck, 6 unit tests, build, and the Playwright smoke test all pass
- [x] GitHub repo created and pushed: https://github.com/bervinbek/hane-puzzle-creator (Q16-Q18 answered)
- [ ] **Needs you:** set Pages source to "GitHub Actions" in the repo settings
- [ ] Verify: live Pages URL loads and the first CI run is green (only the local run is verified so far)

## M1: Drawing to clean outline

- [ ] Image input (upload, drag-drop, paste), downscale (F-01)
- [ ] Preprocess: grayscale, illumination normalisation, threshold, morphological close
- [ ] Silhouette: exterior flood fill, largest component, hole policy
- [ ] Trace (marching squares), simplify (RDP), smooth, resample
- [ ] Scale to mm and fit to the plate (F-08)
- [ ] Controls: threshold, gap closing, smoothness; live preview (F-02)
- [ ] Fixtures: 8-10 drawings incl. open outline, glare, thin legs
- [ ] Verify: 9 of 10 fixtures yield a valid outline with at most 2 slider tweaks

## M2: Puzzle geometry (pure core)

- [x] A1 mini constants module (`src/core/printer/a1mini.ts`, done in M0)
- [ ] Seeded PRNG
- [ ] Seed placement + Lloyd relaxation, Voronoi clip to outline (F-04)
- [ ] Fragment detection and merge for concave shapes
- [ ] Shared-edge extraction, jigsaw knob generator, fit checks (F-05)
- [ ] Clearance via Clipper2 offsets (F-06)
- [ ] Validator: min area, min feature, no overlaps, within bed
- [ ] Property tests across random seeds and N
- [ ] Verify: property tests green for N from 2 to 60 on all fixtures

## M3: Mesh and export

- [ ] Extrude pieces to 3 mm, manifold check (F-07)
- [ ] Binary STL writer, combined + per-piece zip
- [ ] Golden-file test for a fixed seed
- [ ] Printability report: area, volume, grams, time estimate (F-16)
- [ ] Verify: STL opens cleanly in Bambu Studio with no repair prompts

## M4: Puzzle viewer

- [ ] Three.js scene, orbit controls, wood/team materials
- [ ] Z-up (core) to Y-up (render) conversion in one place
- [ ] Exploded/assemble animation (F-18)
- [ ] Bed boundary overlay

## M5: Realistic A1 mini model (dedicated task; see docs/PRINTER_MODEL.md)

- [ ] Reference gathering; tick the verification checklist in PRINTER_MODEL.md section 3
- [ ] Block-out at true scale (347 × 315 × 365 mm, 180³ build volume)
- [ ] Detail pass: frame, rods, toolhead, nozzle, screen, spool holder
- [ ] PBR materials, textured PEI plate
- [ ] Rig: bed Y, toolhead X, gantry Z, limits
- [ ] Lighting and environment, contact shadows
- [ ] Performance pass and Low quality toggle
- [ ] Verify: reviewer recognises the printer; 60 fps on a mid-range laptop

## M6: Print simulation

- [ ] Per-layer toolpath generator (perimeters + solid infill)
- [ ] Playback with correct kinematics, pieces parented to the plate (F-10)
- [ ] Controls: play/pause, speed, scrub by layer, camera presets
- [ ] "Illustrative preview" label
- [ ] Verify: nozzle never leaves the pieces' footprint while extruding; layer count matches 3 mm / 0.2 mm

## M7: UX polish

- [x] Workshop glass shell with Comfort dialog (calm, reduce motion, text size) and piece/difficulty/team controls (UI only, not wired to the core yet)
- [ ] Wizard flow Sketch, Puzzle, Print (kid mode)
- [ ] Teacher mode: clearance, seed, tab style, export options (F-17)
- [ ] In-app sketch pad (F-12), perspective correction (F-13), camera capture (F-14)
- [ ] Difficulty presets (F-15), team colour (F-20), project save/load (F-19)
- [ ] Accessibility pass, mobile/tablet layout, reduced motion
- [ ] Verify: Lighthouse a11y, keyboard-only walkthrough, test on an iPad

## M8: Extras

- [ ] Tolerance calibration coupon (F-22)
- [ ] 3MF export with per-piece colour (F-21)
- [ ] Chamfer option (F-23), interior details (F-25), seed editing (F-26)
- [ ] PWA/offline (F-28), batch mode (F-27)

## M9: Real-world validation and release

- [ ] Print a puzzle on a real A1 mini, record settings and results
- [ ] Tune default clearance and minimum features; update DECISIONS.md
- [ ] Trial with real students/teacher; collect feedback
- [ ] Final docs pass, tag v1.0

## Review log

_(add dated entries here as milestones close)_
