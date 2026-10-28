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

Done before M7 started: Workshop glass shell with the Comfort dialog, the three-step kid flow (Sketch, Puzzle, Print), difficulty presets (F-15), team colour (F-20), mobile and tablet stacking.

Plan (2026-10-29). Each slice is built, tested and pushed on its own, in this order, because the new screens come first and the accessibility pass then covers all of them. Defaults I am building against: Q9 (one URL, a button in the header) and Q2 (fit to 170 mm, the teacher can make it smaller).

### 7a: Draw on screen (F-12)

- [x] `SketchPad` (`src/ui/sketchPad.ts`, pure helpers in `src/ui/strokes.ts`): finger, pen or mouse, smoothed round strokes, three pen sizes, Undo, Clear; strokes are kept as data so Undo is exact
- [x] "Use my drawing" turns the pad into the same image the photo path uses, so gap closing, faint lines and smoothing all work on it
- [x] Tapping "Draw on screen" again returns to the pad with the strokes still there; a blank pad gets a friendly message, not an error; the next step stays closed until the drawing is used
- [x] The "Soon" badge is gone; the pad says it needs a pointer and points at the photo and sample options
- [x] Verified: 6 unit tests of the stroke helpers; 3 e2e tests (draw with the mouse, undo, clear, thick pen, tidy controls, puzzle; keep strokes; tiny dot message); the laptop-fit test now also covers the pad at all four sizes
- [ ] **Needs you:** try it with a finger or pen on a real tablet (the e2e only uses a mouse)

### 7b: Save and open a project (F-19)

- [x] `src/core/project.ts`: JSON with the cleaned outline (mm), pieces, cut number and team (teacher settings join it in 7c); strict parsing with plain-language errors (not JSON, wrong app, newer version, damaged, too big for the plate, file too large)
- [x] A "Project" button in the header (next to Comfort) opens a dialog with "Save my project" and "Open a saved project", on every step. Changed from the plan (buttons on the Puzzle and Print steps and an option on step 1): those panels have no spare room on a laptop, and one place that is always there is more predictable
- [x] The photo or drawing is never saved, only the outline (privacy: drawings are of minors); the file is checked in a test to hold nothing else
- [x] Verified: the loaded project gives a byte-identical STL; broken, foreign, too-new and oversized files and nonsense numbers are refused with a message; 3 e2e tests (save, change, open; open from step 1; refuse bad files)

### 7c: Teacher mode (F-17)

- [x] A "Teacher" button in the header opens a dialog (like Comfort, so the laptop layout does not grow): print gap (0.15 to 0.60 mm), tab amount (fewer, standard, more), biggest size (6 to 17 cm), cut number, file name. The buttons stay in view while the dialog scrolls on a short window
- [x] Saved on this device (`hane.teacher.v1`); the header says "on" in words, and with a dot on a phone or narrow laptop, whenever anything is not standard, so a child is never surprised by it. A project file carries the print settings (not the file name), and opening one applies them
- [x] Verified: every combination of 3 shapes, 3 piece counts, 3 tab amounts and gaps from 0.15 to 0.6 is valid; scaling to 60, 100 and 140 mm stays valid and fits; standard settings give the same STL bytes as before; a wider gap or more tabs changes the STL; "fewer" gives 15 to 27 % fewer tabs and "more" gives 36 to 55 % more on the sample fish (6, 12 and 24 pieces); 4 e2e tests (standard, saved and reset; size cap, cut number and file name reach the files; project round trip; keyboard and Escape)
- Changed from the plan: the smallest gap is 0.15 mm, not 0.1. At 0.1 mm the validator rightly reports pieces "too close together" at 32 pieces, because the geometry is only exact to a few thousandths of a millimetre and 0.1 mm is below what a 0.4 mm nozzle holds anyway
- [ ] **Needs you:** print the same puzzle at 0.25, 0.30 and 0.40 mm and say which fits best (the default is still a starting point, Q12)

### 7d: Camera and straightening (F-14, F-13)

- [x] "Use the camera" (`src/ui/camera.ts`) with a live preview and a Take photo button; the picture goes the same way as any photo; the camera is turned off as soon as the photo is taken, on Cancel, or when anything else is picked; four plain messages when it is refused, missing, busy or fails, each pointing at the photo option; the button is not shown when the browser has no camera support
- [x] `straighten` in the core (`src/core/image/perspective.ts`: a projective map from the four corners, bilinear sampling, white where the corners reach outside the photo)
- [x] "Straighten the picture" (photos only): four dots to drag by finger or mouse, or with the arrow keys (Shift for bigger steps), the outside shaded, Apply, Reset corners and Cancel; crossed or tiny corners are refused in words; the next step stays closed until the tool is closed
- [x] Verified: 11 unit tests, including a drawing photographed at an angle that the outline finder reads as an upright 2 : 1 ellipse; 7 e2e tests with a fake camera device (take a photo, cancel, switching away, refused, no support, drag and keys, cancel)
- [x] While here: the laptop layout now gives the two cards one row that fills the window, so they keep the same size on every step. Before, their height followed the left panel, which made the picture tiny while straightening (and the cards jump in size between steps)
- [ ] **Needs you:** try straightening a real whiteboard photo, and the camera on a real laptop and tablet (the e2e uses a pretend camera)

### 7e: Accessibility, tablet and phone, reduced motion

- [x] Automated checks with axe-core (WCAG 2.2 AA plus best practice) on every step, tool and dialog, in the normal look and in Calm mode (`e2e/a11y.spec.ts`). Found and fixed: the Top and Angle buttons had spoken names that did not contain their visible words ("Label in name")
- [x] Keyboard-only walkthrough as an e2e test (`e2e/keyboard.spec.ts`): a skip link (new) and every control reachable in reading order; options, sliders, radios, the 3D canvas, Watch it print and the download all used by keys; every control on step 2 shows an outline ring when focused; dialogs keep the focus inside, close with Escape and give it back; a blocked Next explains itself
- [x] Tablet and phone: 5 portrait sizes (744 x 1133, 768 x 1024, 820 x 1180, 390 x 844, 360 x 640) and 2 landscape tablets (1024 x 768, 1180 x 820, which use the laptop layout and must not scroll) with a finger as the pointer (`e2e/responsive.spec.ts`): no sideways scrolling and every button, option, toggle, slider and corner ring at least 44 px, on every screen and dialog. Found and fixed: small buttons were 40 px, sliders 24 to 30 px (now 44 px for a finger), the Flat / 3D and Slow / Normal / Fast switches 34 to 36 px, the corner rings 27 to 38 px (now 48 px at any size), the team tag was drawn under the 3D picture and under the Flat / 3D switch on a narrow screen. Screenshots of the new screens on a tablet and a phone checked by eye
- [x] Reduce motion and Calm (`e2e/motion.spec.ts`): with the system setting or the Comfort switch, no animation, transition or smooth scrolling exists anywhere on any screen or dialog; the 3D view does not draw by itself and pulling apart jumps instead of gliding; turning it off brings the fades back. Found and fixed: Calm still asked for a zero-size backdrop blur; it now asks for none
- [ ] **Needs you:** run Lighthouse on the live site (it uses the same rules as axe, so I expect few surprises, but it also checks things axe cannot); a walkthrough on a real iPad; one child and one teacher try the drawing pad and the Teacher dialog; a screen reader pass (VoiceOver or NVDA) on steps 1 to 3

## M8: Extras

Plan (2026-10-29). The "Could have" list, in the order that helps the real-world work in M9 first. Each slice is built, tested and pushed on its own. Left out on purpose, with the reason:

- **3MF with per-piece colours (F-21):** blocked on Q1 (one colour per puzzle or several) and I cannot check how Bambu Studio reads colours from a file I make. The separate-pieces zip already lets a teacher colour pieces in Bambu Studio.
- **Interior details (F-25):** eyes and spots as holes or engraving need pieces with holes all through the pipeline (cutting, tabs, clearance, extrusion, viewer). That is a milestone of its own, and Q6 still says "ignore".

### 8a: Tolerance test print (F-22)

- [x] `toleranceCoupons` in the core (`src/core/puzzle/coupon.ts`): three small two-piece puzzles side by side with gaps of 0.20, 0.30 and 0.40 mm, cut with the real tab code and explicit cut points, marked by 1, 2 and 3 notches in the edge of the left piece so the printed pieces say which gap they have
- [x] A "Download a gap test" button in the Teacher dialog gives one STL (`hane-puzzle-gap-test.stl`, six pieces, 3 mm) with the instructions in words under it; the coupons use the tab amount chosen in the dialog
- [x] Verified: each coupon's two pieces are really the stated gap apart (measured, within 0.02 mm); every piece is a closed solid; the six fit the plate with room; the notches take the expected bite; the file is the same every time; 7 unit tests and 1 e2e test
- [ ] **Needs you:** print it and say which gap fits (this is the real-print check for Q12)

### 8b: Batch mode (F-27)

- [x] `batchZip` in the core (`src/core/export/batch.ts`): several puzzles in one zip, each made again from its saved project exactly as the Print step makes it (`puzzleForProject`), with an STL for each, the project files to reopen them, and a readme; puzzles that cannot be made (no inside, no pieces, an error) are left out and named; the same zip every time
- [x] A "Class batch" part in the Project dialog: add this puzzle, a list with a colour dot, the team name and a Remove button for each, Download, Clear. Up to 20 puzzles. Kept in this tab (session storage): a reload keeps it, closing the tab drops it. File names follow the Teacher file name ("class-5b-batch.zip"); the same team twice gets "-2"
- [x] Verified: the zip holds exactly the files the list says; a team's STL in the batch is byte-identical to the one it would download alone; bad stored entries are dropped; 8 core tests, 4 storage tests and 2 e2e tests (collect, reload, remove, download, clear; repeats and file names)

### 8c: Move the cut points (F-26)

- [x] The core takes the cut points as an input (`PuzzleParams.seeds`, done in 8a) and reports the ones it used (`Puzzle.seeds`), automatic or given
- [x] "Move the cut points" next to Shuffle on the flat picture of the Puzzle step: a 44 px dot for every piece to drag by finger or mouse, or move with the arrow keys (1 mm, Shift 5 mm); the pieces are re-cut once per frame as you move; a dot cannot leave the shape; Done moving, or Automatic cuts to go back. Changing the number of pieces, shuffling, or choosing another drawing puts the cuts back to automatic (and says so)
- [x] The cut points are saved in project files (one per piece, in the drawing's own millimetres, scaled with it when the teacher caps the size) and are used by the Print step, the STL, the zip and the class batch
- [x] Verified: a moved point moves the cut by the right amount (30 mm of movement shifts the cut 15 mm); 25 random placements on the sample fish all stay valid; a project with cut points gives the same STL after save and open; bad cut-point lists are refused; 8 core tests and 5 e2e tests
- [ ] **Needs you:** try dragging on a real tablet (the e2e uses a mouse)

### 8d: Works offline (F-28)

- [ ] A service worker made at build time lists every file of the build, so the whole site (3D view included) works without a network after the first visit; a new deploy replaces the old files on the next online visit
- [ ] A web app manifest and icons so it can be added to the home screen of an iPad or Chromebook
- [ ] Verify: Playwright loads the site, goes offline, reloads, and makes a puzzle, opens 3D and downloads an STL; the generated worker is unit tested; nothing is cached that is not part of the build

### 8e: Bottom edge relief (F-23)

- [ ] An optional first-layer step (off, small 0.2 mm, medium 0.3 mm) that pulls the bottom edge in so the "elephant foot" does not fuse pieces; a Teacher setting saved in projects
- [ ] Verify: still closed solids with the right volume; off gives the same bytes as before; the coupon follows the setting
- [ ] **Needs you (before anyone trusts it):** print the test coupon with relief off and on and say which fits

## M9: Real-world validation and release

- [ ] Print a puzzle on a real A1 mini, record settings and results
- [ ] Tune default clearance and minimum features; update DECISIONS.md
- [ ] Trial with real students/teacher; collect feedback
- [ ] Final docs pass, tag v1.0

## Review log

_(add dated entries here as milestones close)_

### M7: UX polish (2026-10-29)

- Built in five slices, each tested and pushed on its own: draw on screen (7a), save and open a project (7b), teacher options (7c), camera and straightening (7d), accessibility and device checks (7e). Decisions D-026 to D-030 in docs/DECISIONS.md.
- The numbers at the end: 377 unit tests (from 245 before M7) and 55 end-to-end tests (from 17), lint and typecheck clean. The two largest finds were not in my plan: the laptop layout let the card height follow the left panel (the picture was tiny while straightening and the cards jumped in size between steps; now one row fills the window), and touch targets under 44 px in several places.
- Changed from the plan: save and open live in one Project dialog in the header, not on each step (no room in the laptop panels); the smallest print gap is 0.15 mm, not 0.1 (below that the validator rightly objects).
- Not checked, and only a person can: a real finger or pen on the pad, the camera and the straightening on a real device and a real whiteboard photo, a screen reader, Lighthouse, an iPad, and children and teachers using it.

### M6: print simulation (2026-10-29)

- Built the toolpath in the core (pure, no DOM, 6 to 24 pieces in about 110 to 130 ms) and an illustrative player in `src/render/`. Finished layers are the solid piece meshes squashed to the printed height (a piece is a straight extrusion, so this is exact); only the layer being printed is drawn line by line, which keeps playback light.
- Playback covers the head parking and coming back (lift first, then slide), the spool turning with the plastic used, and the bed carrying the pieces. The picture from above keeps the plate still, because the machine is hidden there and a sliding plate would leave the frame.
- Checked: 245 unit tests, lint, typecheck, 17 end-to-end tests (including a phone-width check of the print controls) including the four laptop sizes with the new controls (the strip must sit under the picture inside the card), and screenshots of layer 1, mid-layer and layer 12.
- Not checked: frame rate on school hardware; how the speeds feel to a child.
