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
- [x] Pages source set to GitHub Actions
- [x] Verified: live at https://bervinbek.github.io/hane-puzzle-creator/ (2026-10-28); CI green

## M1: Drawing to clean outline

- [x] Image input (upload, drag-drop, paste), downscale (F-01)
- [x] Preprocess: grayscale, illumination normalisation, threshold, morphological close
- [x] Silhouette: exterior flood fill, largest component, hole policy
- [x] Trace (marching squares), simplify (RDP), smooth, resample
- [x] Scale to mm and fit to the plate (F-08)
- [x] Controls: threshold, gap closing, smoothness; live preview (F-02)
- [x] Fixtures: 12 synthetic drawings (open outline, glare, shadow, noise, thin legs, faint pencil, coloured pen); real student photos still wanted (Q20)
- [x] Verify: 12 of 12 synthetic fixtures give a closed, simple outline (IoU > 0.9) with default settings, one with a single slider change
- [ ] Verify with real photos of student drawings on whiteboard and paper (needs sample images)

## M2: Puzzle geometry (pure core)

- [x] A1 mini constants module (`src/core/printer/a1mini.ts`, done in M0)
- [x] Seeded PRNG (`src/core/rng.ts`)
- [x] Seed placement + Lloyd relaxation (`src/core/puzzle/seeds.ts`)
- [x] Voronoi cells clipped to the real outline as polygons (F-04)
- [x] Fragment detection and merge for concave shapes, plus merging of too-small pieces
- [x] Shared-edge extraction, jigsaw knob transfer, fit checks (F-05)
- [x] Clearance via clipper-lib offsets (F-06)
- [x] Validator: min area, min feature, no overlaps, gap size, within bed, fewer-pieces warning
- [x] Property tests across shapes, random seeds and N
- [x] Verify: 102 property cases green (5 shapes incl. thin legs and an L shape, N from 2 to 60, up to 3 seeds)
- [ ] Verify tab fit on a real print (Q12 clearance, Q14 chamfer) before M9 sign-off

## M3: Mesh and export

- [x] Extrude pieces to 3 mm, manifold check (F-07)
- [x] Binary STL writer, combined + per-piece zip
- [x] Golden-file test for a fixed seed
- [x] Printability report: size, volume, grams, time estimate (F-16); shown on the Print step
- [x] Verify in code: every piece of 15 shape/count cases is a closed, outward-facing, degenerate-free mesh with the right volume
- [x] Confirmed by the owner (2026-10-28): the STL opens in Bambu Studio centred on the textured PEI plate, all pieces in place with the tabs visible
- [ ] Calibrate `TIME_MODEL` (src/core/puzzle/report.ts) against a real Bambu Studio slice of one puzzle

## M4: Puzzle viewer

- [x] Three.js scene, orbit controls, pastel-by-piece and team-colour materials
- [x] Z-up (core) to Y-up (render) conversion in one place (the `world` group rotation in `src/render/viewer.ts`, with a test)
- [x] Pull-apart slider (F-18); animation only when motion is not reduced
- [x] Bed boundary overlay (180 mm plate with 10 mm grid and the 170 mm usable area dashed)

## M5: Realistic A1 mini model (dedicated task; see docs/PRINTER_MODEL.md)

- [x] Reference gathering; verification checklist ticked in PRINTER_MODEL.md section 3 (2026-10-29)
- [x] Block-out at true scale (tested: 347 × 316 × 365 mm; plate exactly 180 × 180 mm)
- [x] Detail pass: base, rods, column with holes, arm, toolhead, nozzle, screen, ports, vents, cable, spool (rails, belts and the real toolhead shapes are still simplified)
- [x] PBR materials with a room reflection map, speckled textured sheet, glass-like screen
- [x] Rig: bed Y, toolhead X, gantry Z with limits (`setPose`, tested)
- [x] Lighting and environment, ground shadow
- [x] Performance: about 8,000 triangles, instanced screws and holes; Calm mode is the low-quality switch (no shadows, pixel ratio 1)
- [x] Owner feedback 2026-10-29: proportions, toolhead and arm, and spool or views were off. Revised (D-023): L-shaped base with a screen block, wide carriage, bigger toolhead, dark column housing, two cables, spool removed, new views
- [x] Owner request 2026-10-29: white-filament spool back on, standard textured PEI plate (D-024)
- [ ] **Needs you:** compare the "Printer" view with your A1 mini again
- [ ] Measure frame rate on a real mid-range laptop and an iPad

## M6: Print simulation

- [x] Per-layer toolpath generator (`src/core/printer/toolpath.ts`): two walls, then solid zig-zag fill that turns 90 degrees each layer; 15 layers of 0.2 mm
- [x] Playback with correct kinematics (`src/render/simulation.ts`): the bed slides in Y, the toolhead runs in X, the gantry steps up in Z; pieces are children of `rig.plate` so they ride the bed (F-10)
- [x] Controls on the Print step: Play / Pause / Replay, layer slider ("Layer 7 of 15"), Slow / Normal / Fast, the existing Top / Angle / Printer cameras, and a "Watch it print" button on the flat picture
- [x] "Illustrative preview" label over the picture
- [x] Verified by tests: every extruding move is inside a piece (more than 10,000 moves checked); the nozzle in plate coordinates equals the toolpath at 7 sample times; 15 layers; the plate world position follows the bed and the nozzle's y never changes; the spool turns forward only
- [ ] **Needs you:** watch it on the real site and say if the speed and look feel right (the Slow / Normal / Fast lengths are my guess: about 150 s, 70 s and 28 s for a whole print)
- [ ] Measure frame rate during playback on a real mid-range laptop and an iPad

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

### M6: print simulation (2026-10-29)

- Built the toolpath in the core (pure, no DOM, 6 to 24 pieces in about 110 to 130 ms) and an illustrative player in `src/render/`. Finished layers are the solid piece meshes squashed to the printed height (a piece is a straight extrusion, so this is exact); only the layer being printed is drawn line by line, which keeps playback light.
- Playback covers the head parking and coming back (lift first, then slide), the spool turning with the plastic used, and the bed carrying the pieces. The picture from above keeps the plate still, because the machine is hidden there and a sliding plate would leave the frame.
- Checked: 245 unit tests, lint, typecheck, 17 end-to-end tests (including a phone-width check of the print controls) including the four laptop sizes with the new controls (the strip must sit under the picture inside the card), and screenshots of layer 1, mid-layer and layer 12.
- Not checked: frame rate on school hardware; how the speeds feel to a child.
