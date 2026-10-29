# Roadmap and Progress

Legend: `[ ]` todo · `[x]` done. Update as work completes. Add a dated Review entry at the bottom of each finished milestone.

Last updated: 2026-10-29

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

- [x] A service worker written at build time (`tools/offline.ts`, wired in `vite.config.ts`) lists every file of the build (the 3D part included, but not source maps or the old .woff font copies), stores them when it installs, and answers from the store. The page itself comes from the network first (so a new deploy shows up) and from the store after 3.5 s or when offline. The two newest stores are kept, so a tab left open across a deploy can still load the 3D view. Nothing outside the build is stored and nothing about the user is
- [x] A web app manifest and icons (`public/`, drawn by `tools/make-icons.mjs` from the favicon's puzzle piece) so it can be added to the home screen of an iPad or Chromebook, including a maskable icon and the Apple touch icon
- [x] Verified in a real browser: after one visit the site reloads with the network switched off, makes a puzzle, opens the 3D view and downloads an STL, with its fonts. This caught a real bug: the stored scripts and styles were missed because of a "Vary: Origin" header, fixed with `ignoreVary`. 13 unit tests run the generated worker against a pretend browser (install, keeping two stores, leaving other requests alone, store first, network first with a slow-network fallback, newest copy wins, no hang when there is nothing); 2 e2e tests; checked that the built worker and manifest use the Pages base path
- [ ] **Needs you:** open the live site once on a school device, switch off the Wi-Fi, and reload; and try "Add to home screen" on an iPad

### 8e: Bottom edge relief (F-23)

- [x] An optional first-layer step in the extruder (`extrudePolygon(..., relief)`): the first layer (0.2 mm) is pulled in by 0.2 mm (Small) or 0.3 mm (Medium), with a narrow ledge facing down above it, still one closed shell per piece. Off is the default and gives exactly the bytes it always did. A piece too thin to pull in is left plain. A Teacher setting ("Bottom edge: Off, Small, Medium"), saved in projects, and used by the STL, the zip, the class batch and the gap test
- [x] Verified: every piece of 6, 12 and 24 piece puzzles is watertight with relief (both amounts); the floor is exactly the inset smaller and one layer up is full size; the volume is the plain piece less the ledge; off gives identical bytes; 13 unit tests and 1 e2e test
- Not shown in the 3D view: the step is 0.2 mm tall, so the viewer and the print player keep drawing plain pieces (the file has the step)
- [ ] **Needs you (before anyone trusts it):** print the gap test once with the bottom edge Off and once with Small and say which fits. I could not check this against a real print, and a first-layer step is only a guess at your printer and filament

### M8 left for later

- 3MF with per-piece colours (F-21): needs Q1 and a check in Bambu Studio
- Interior details as holes or engraving (F-25): needs pieces with holes through the whole pipeline; Q6 still says "ignore"
- Not in the list: frame or tray backing (F-29), engraved team initials (F-24), other languages (F-30)

## M10: Rollout revision (backlog, logged 2026-10-29, not started)

Requested by the user to be done in a **future session**, one slice at a time (context would be lost in one long session). Plan each slice first (plan mode, per workflow rules), tick items as they land, record reversals in docs/DECISIONS.md. Several items reverse earlier decisions (3D viewer, team colours, per-piece download, interior details), so each needs a D-0xx entry.

Decided with the user (2026-10-29): the "Number of habits" text means **"Number of pieces"**; magnets are **6 × 2 mm discs**; the **puzzle is printed three times, one full set per colour** (white, tan, gold); the Puzzle animation **plays once and stays gold** (with a Replay button).

Note: at the time of logging, `src/styles/app.css`, `src/styles/tokens.css` and `src/ui/comfort.ts` had uncommitted edits. Check `git status` and ask before building on them.

### 10a: Outline and wording (small, do first)

- [x] Drop everything inside the drawn shape: keep only the perimeter and close it into one closed shape (extractor already ignores interior per Q6; confirm no holes survive anywhere, including thin gaps closed into the outline). Add a test with a drawing that has eyes, patterns and an inner scribble
- [x] Remove the "Your puzzle: W × H cm" size line (`src/ui/shell.ts` ~815). Keep the size on the Print report
- [x] Replace the difficulty blurbs with "Number of pieces" (`src/ui/presets.ts` `DIFFICULTIES`). Open point: this is now the same text on Easy, Medium and Tricky, so show it once as a label for the chips and show the actual count (6 / 12 / 24) instead of a per-chip blurb
- [x] Update the e2e tests and `steps.ts` copy that quote the old text

Review (2026-10-29): the extractor already fills the silhouette from the outside and keeps the biggest loop, so no code change was needed for the interior; added a test with a large inner ring plus eyes and spots. Size line removed from the Puzzle picture (the Print report keeps it; e2e now checks it there). Chips read "Easy · 6", "Medium · 12", "Tricky · 24" under the label "Number of pieces"; the blurbs are gone. 430 unit and 66 e2e tests, lint and typecheck clean.

### 10b: Colours and teams

- [x] Remove the five team colours (yellow, blue, tan, brown, red). Students are grouped by the animal they drew, not by team colour
- [x] Replace the "Team colour" control with a plain **"Colour:"** that shows three swatches: gold (glossy), tan, white (`TEAMS` in `src/ui/presets.ts`, `--team-*` tokens, `shell.ts` team note). Swatch must not rely on colour alone (label each), glossy gold needs a highlight in the swatch
- [x] Decide what happens to the old `team` field: saved projects (`src/core/project.ts`) and batch file names (`src/core/export/batch.ts`, `src/ui/teacher.ts`, `batch.test.ts`) use team ids. Needs a migration for old project files (map unknown team ids safely) and a new batch naming scheme (by animal name instead of team)
- [x] The Colour control now shows the three filaments the puzzle is printed in; there is no per-puzzle pick (puzzle prints once per colour). Confirm in the plan whether "Colour:" is display-only

Decided with the user: batch and file names use an optional **animal name** field; the Colour control is **display-only**.

Review (2026-10-29): `team` is gone from `Project` (now `name`, version 2; version 1 opens and the team is ignored), the batch, the file names and the UI; five `--team-*` tokens and the swatch-picker CSS removed. The Puzzle step has an inline Animal name box and a Colour list (Gold (glossy), Tan, White; the gold swatch has a highlight). Everything squeezed onto the laptop panel, so the fit test forced the two rows to be inline and small. Decision D-036.

### 10c: Puzzle step, 2D animated preview only

- [x] Preview uses three fixed colours (white, tan, gold) instead of the multi-colour greedy colouring. Pieces start white
- [x] 2D animation from the top view: pieces are swapped and upgraded at random, white to tan and then to gold, until every piece is gold; plays **once and stays gold**, with a Replay button. Must be deterministic from the seed (same seed gives same order) and follow Comfort settings: reduced motion shows the final all-gold puzzle with no animation, no colour-only state (each colour needs a label or pattern), controls reachable by keyboard
- [x] Remove the 2D/3D toggle and the 3D viewer from the Puzzle step: only the fixed top-view animation. Open point: this drops orbit, pull-apart and the keyboard viewer controls (M4); decide whether `PuzzleViewer` stays only for the printer scene or is trimmed
- [x] Update e2e (viewer, "fits without scrolling" at the four laptop sizes) and `docs/DESIGN.md`

Decided in the plan: `PuzzleViewer` stays for the Print step (10d), only the Puzzle step loses it; Replay is hidden with Reduce motion; any change to the cut ends the animation at once. Tan pieces get stripes and a count line says how many are in each colour.

Review (2026-10-29): see D-037. The animation order is `src/core/puzzle/reveal.ts` (4 tests). The 3D e2e tests moved to the Print step; added three animation tests.

### 10d: Print step, always the 3D printer

- [x] Show the A1 mini with the puzzle on the plate by default, at the angled view. Remove the 2D view and the 2D/3D toggle on this step
- [x] Animate the head so it visibly prints the pieces and **cycles through the three filament colours** (white, then tan, then gold): the puzzle is printed three times, one full set per colour. The new plate shows the current colour; finished sets stay shown (or are cleared) between colours: decide in the plan. Uses `setPose`, `buildToolpath` and `stateAt` (`src/core/printer/toolpath.ts`, `src/render/simulation.ts`); the toolpath needs a "run" dimension (three passes) and a colour per pass
- [x] Update the Print report for three prints: plastic grams and time are per set and in total
- [x] Update the STL download wording: one whole-puzzle STL, printed three times (same geometry)
- [x] Export is **always the whole puzzle as one STL, never per-piece STLs** (decided 2026-10-29). Remove the per-piece zip in `src/core/export/bundle.ts` and its button on the Print step, plus tests. The class batch (M8b, `src/core/export/batch.ts`) must follow the same rule: one whole-puzzle STL per project, no per-piece files inside it. Update docs/DECISIONS.md

Decided in the plan: the class batch never used the per-piece zip, so removing it touched only the Print step. Plate between prints is cleared (a real plate holds one set); the run status names the colour. Autoplay on arrival unless Reduce motion. Review (2026-10-29): see D-038.

### 10e: Magnet pockets (press-fit from the top)

- [x] Add one blind pocket per piece for a **6 × 2 mm disc magnet**, open on the top face (Z = 3 mm), press-fit from the top. Floor under the magnet stays solid (about 1 mm at 3 mm thick), pocket centred on each piece's best inner point (pole of inaccessibility), clear of tabs and the minimum wall
- [x] Press-fit clearance: pocket diameter slightly over 6 mm and a bit shallower or deeper than 2 mm. Starting values are guesses; tune on a real print and record in DECISIONS.md. Likely make the clearance a Teacher option (like the gap)
- [x] Core change, not just the mesh: pieces now need a blind hole through the pipeline (extrude, caps, manifold check, golden STL, `report.ts`). Skip with a warning for a piece too small to hold the pocket and wall; show that in the validity report
- [x] Add the pockets to the 3D printer scene and the gap test print, and update the property tests (valid, non-overlapping, manifold, fits the plate, pocket inside the piece)
- [ ] Real print on the A1 mini before it is called done (M9): **still to do**
- [x] Note: this is not a pause-and-insert print; the magnets go in after printing, so no filament-change or pause step is needed

### 10f: Final design review (do last, after 10a to 10e)

- [x] **Copy audit first: keep words and text only where absolutely necessary** (user rule, 2026-10-29, applies to all of M10 as well as this review). Go through every screen and dialog and remove hints, blurbs, notes, step descriptions and repeated labels that an icon, the layout or the picture already says. Keep only text that is needed to act, or that stands in for colour or an icon (accessibility). Shorter copy also removes much of the overflow risk below
- [x] Accessibility limit on the audit: `docs/DESIGN.md` section 9 still rules. Keep text for buttons and form controls (accessible names, which can be visually hidden if an icon shows), error and warning messages, and swatch labels (no colour-only state). Tooltips and `aria-label`s can carry the words that leave the screen. Record the cut text rule in docs/DECISIONS.md
- [x] Review every step (Draw, Puzzle, Print) and the dialogs (Project, Teacher options, Comfort) for **text misalignment and overflow**: clipped, wrapped-badly or overlapping text, labels running outside their panel or button, and uneven alignment between controls
- [x] Check at the four laptop sizes (must still fit without page scrolling, D-017), tablet and phone widths (stacked and scrolling), and with Comfort settings on (larger text, reduced motion, high contrast). The new copy ("Number of pieces", "Colour:" with three labelled swatches, Replay button, three-print report) is the likeliest to break layouts
- [x] Fix what is found in the CSS (`src/styles/`), keeping opaque panels behind text and no colour-only state (docs/DESIGN.md section 9)
- [x] Add an e2e check where practical: no element's `scrollWidth` exceeds its `clientWidth` on the main panels at each size
- [x] Take screenshots before and after and add a dated entry to the Review log

Review (2026-10-29): see D-039. `Piece.pocket` runs through generate, STL, viewer, simulation, report, Teacher options (magnet pocket fit) and the gap test print. 482+ unit tests (new: polylabel, magnets, pockets across three shapes, 6/12/24 pieces and three seeds; golden file replaced). Not verified: a real print and a real magnet: depth, width and floor are guesses.

### Questions still open for the plan step

- Magnet polarity: one orientation for all pieces (pieces attract or repel on the table), or leave to the teacher? Probably out of scope, record a note in the docs
- What does the page show for the real-world meaning of "gold (glossy)"? Print note: gloss comes from the filament chosen (for example silk gold), not from the geometry

## M11: Draw flow and Puzzle step follow-ups (done 2026-10-29 to 2026-10-30)

Requested by the user. Plan each slice first (plan mode), tick items as they land, record changes in docs/DECISIONS.md. Check `git status` before starting.

### 11a: Draw on screen goes straight to the puzzle

- [x] When the picture comes from **Draw on screen**, "Smooth the wobbles" (`#smooth`, `src/ui/shell.ts` ~521) defaults to its **maximum** (100). "Pick up faint lines" keeps its current default. Photos keep today's smoothness default, so this is a per-source default, not a global change. Open point: if the student moves the slider, keep their value for the rest of that drawing
- [x] Remove the **"Use my drawing"** button (`data-action="use-drawing"`, `shell.ts` ~481) and the hint that points at it (~951, "Press Use my drawing to continue"). The bottom-right **Next** button confirms the drawing and moves to the Make the puzzle step, doing what `useDrawing()` (~1266) does today (extract the outline, then go to step 2)
- [x] Next must be enabled as soon as there is something drawn, and give a clear message if the drawing is empty or no outline can be found (the error text that `useDrawing()` shows now). Keep the keyboard path (Tab to Next, Enter) and the accessible name
- [x] Check that the photo / camera path is unchanged (it may still need its own confirm; decide in the plan whether Next replaces that button too, for one predictable layout, D-017 / DESIGN.md section 9)
- [x] Update e2e tests and `steps.ts` copy that quote "Use my drawing"; the laptop "fits without scrolling" test still has to pass

Review (2026-10-29): see D-040. `go()` confirms the pad (`confirmDrawing`), Next opens as soon as there is ink, `DRAWN_TIDY` smoothness 100, kept if the student moves it. Photo and sample paths unchanged (their Next already was the only confirm). Draw e2e tests updated; a legged animal checked in the browser.

### 11b: Puzzle step is the 2D top view only

Already covered by **10c / D-037** (white, tan, gold random upgrade, fixed top view, no 2D/3D toggle). Kept here so nothing is lost; confirm the shipped behaviour matches what was meant before doing more.

- [x] Review the shipped Puzzle-step animation against the request: pieces are **gradually swapped and upgraded** in colour white, then tan, then gold, in random order, until all are gold; one fixed top view; no toggle. Open point: "swapped" is read as "a piece changes colour step by step"; if pieces should also **trade places** on screen, say so and plan it as a new slice
- [x] If the review finds a gap, fix it in `src/core/puzzle/reveal.ts` / the Puzzle-step preview and add a test. If nothing differs, tick this and close 11b with a one-line Review

Review (2026-10-29): see D-041. The colour order already matched; "swapped" was read as the piece drifting out and back (user's choice), so `driftVector` plus a `.drift` group were added. Pieces never end up swapped. Unit test and e2e (drifts while playing, none left after, none with Reduce motion).

### 11c: Remove team colour from the Puzzle step

Note: the five team colours were already removed in 10b / D-036. What is left is the display-only **Colour:** list (Gold, Tan, White swatches, `shell.ts` ~560) and the `FILAMENTS` list in `src/ui/presets.ts`. Read the request as "remove that too".

- [x] Remove the **Colour:** control from the Puzzle step controls (`puzzleControls()`), its CSS (`.filaments`, `.swatch`) and any e2e test that looks for it. Open point: the animation's count line and the tan stripes (10c) already name the three colours, so check that no colour-only state is left once the list goes (DESIGN.md section 9). Keep `FILAMENTS` only if the animation or the Print step uses it
- [x] Confirm nothing else mentions a team colour (saved projects already ignore it, version 2)

Review (2026-10-29): see D-043. The Colour list and its CSS are gone; `FILAMENTS` stays (animation and Print step). The count line and tan stripes still name every colour.

### 11d: One "Number of pieces" control, centred under the preview

Note: the "Or pick how tricky" wording is gone from the code; the Easy · 6 / Medium · 12 / Tricky · 24 chips now sit under the label "Number of pieces" (`DIFFICULTIES` in `src/ui/presets.ts`, `shell.ts` ~547). Read the request as "remove the Easy / Medium / Tricky chips".

- [x] Remove the Easy / Medium / Tricky chips and the `level` radio handling; `DIFFICULTIES`, `difficultyFor` and their tests go if nothing else uses them. Check the Teacher options and saved projects for `level` or difficulty ids
- [x] Keep **How many pieces?** (the − / number / + stepper and the slider, `MIN_PIECES` to `MAX_PIECES`) and move it out of the side controls to sit **centred directly below the 2D animation** of the puzzle preview. Same control, same keyboard use, same live announcement
- [x] Layout has to hold at the four laptop sizes without page scrolling (D-017), and stack cleanly on tablet and phone; the preview should keep its size when the control moves under it

Review (2026-10-29): see D-043. Chips and `DIFFICULTIES` removed; the count control moved to `#pieces-control` under the preview (listeners moved with it), capped preview height keeps laptops from scrolling (checked at 1280x600, 1366x768, 1920x1080). Keyboard and e2e specs updated.

### 11e: Remove "Move the cut points"

- [x] Remove the **Move the cut points** and **Done moving** buttons (`shell.ts` ~237), the drag-the-dots and arrow-key editing (`src/ui/` steer code), the "cut points went back to automatic" notice (~1032) and the hint text (~1050)
- [x] Decide in the plan what happens to the code under it: `generatePuzzle` can still take given seed points (`generate.ts` ~31), but nothing will pass them. Remove the unused paths in the UI and the saved `points` field in projects (`src/core/project.ts`; old project files that carry points must still open, ignoring them). Keep seeded automatic placement (determinism, same seed gives the same STL)
- [x] Remove or update the unit and e2e tests for moving cuts; record the removal in docs/DECISIONS.md (reverses M8c / F-26)

Review (2026-10-29): see D-043. Cut-point UI, `seeds` in projects and the e2e block removed; old files with `seeds` open and ignore them (unit tested). `generatePuzzle` keeps its `seeds` input for the gap test print.

### 11f: Design review of the Puzzle step (do after 11c to 11e)

- [x] With the Colour list, the tricky chips and Move the cuts gone, review what is left on step 2: the 2D animated preview, Replay, the animal name, the centred pieces control, the colour count line, Next / Back and any warnings from the validity report. Decide the best arrangement: what goes where, what order, what is the one obvious thing to do, what can lose its label or move into Teacher options
- [x] Apply the copy rule (keep words only where necessary, DECISIONS.md) and DESIGN.md section 9 (opaque panels behind text, no colour-only state, predictable layout, Comfort settings)
- [x] Try at least two layouts (for example preview large with controls in one row beneath, versus preview with a slim side column) and pick one with screenshots; check the four laptop sizes without scrolling, tablet, phone, and Comfort on (larger text, reduced motion, high contrast)
- [x] Write the chosen layout into docs/DESIGN.md and a D-0xx entry; add an e2e check that nothing overflows its panel (`scrollWidth` vs `clientWidth`)

Review (2026-10-30): see D-044. Layout B chosen by the user from two mockups: only the count under the picture, Replay and Shuffle in the panel, hint removed. Checked at 1280x600, 1366x768, 1366x657 and a phone (390x844) in the browser; the e2e fit test now also checks the picture, count and panel buttons sit inside their cards at all laptop sizes, and the responsive spec checks the panel and card for sideways overflow.

## M12: Sketch and gold polish (backlog, logged 2026-10-29, not started)

Requested by the user. Plan each slice first (plan mode), tick items as they land, record changes in docs/DECISIONS.md. Check `git status` before starting: `src/ui/shell.ts` and two e2e specs had uncommitted edits when this was logged, and 11c to 11f above are ticked while the code still showed the Colour list and the cut-point buttons. Sort that out first so these slices do not build on half-finished work.

### 12a: One pen size

- [x] Remove the pen size choice (thin / medium / thick) from the drawing tools (`padTools()` in `src/ui/shell.ts` ~475, the `pen` state and its change handler ~1587, `SketchPad.setPen` in `src/ui/sketchPad.ts`). The pen is always **medium** (`PEN_WIDTH.medium`, 10)
- [x] Remove `PenSize` and the thin / thick widths in `src/ui/strokes.ts` if nothing else uses them; keep the stroke width a single constant. Update `strokes.test.ts`, the sketch e2e tests, and any copy or `steps.ts` text that mentions pen size
- [x] Check the Draw tools row still fits at the four laptop sizes without scrolling (D-017) and keep Undo / Clear reachable by keyboard

### 12b: Draw is the first thing people see, with a faint guide

- [x] The Draw step opens with **Draw on screen already selected**: the sketch pad is showing on first visit, not the three cards (photo / sample / draw). Keep Add a photo and Use the sample fish reachable (for example as the compact option row above the pad, `options compact`, `shell.ts` ~527). Open point for the plan: does a saved project or a returning visit change this (no, unless the user opened a project)
- [x] A **faint guide animation** on the empty canvas: a simple line sketch of a shape (for example a small animal outline) draws itself stroke by stroke, then fades away. Plays when the pad is empty on arrival, and stops at once on the first touch, pen or mouse press. After it fades, repeat after a pause only while the pad is still untouched; do not loop non-stop
- [x] The guide is **not part of the drawing**: it is never added to the strokes, Undo, the outline, a saved project or the extractor input. Draw it in a separate layer (CSS/SVG over the canvas, or a separate canvas) and clear it before the first stroke
- [x] Comfort: with Reduce motion on show a still, faint example (or nothing) instead of animation; low opacity must still be visible in high contrast; add an accessible text equivalent (a short label or `aria-label`, hidden from the extractor). Keep it from reading as a real line the student has to trace
- [x] Test: guide is present on arrival, gone after the first stroke, absent from the outline of a drawing made after it; e2e for Reduce motion

Review (2026-10-30, 12a and 12b): the pen is one size (`PEN_WIDTH` = 10); the Pen row, `PenSize` and `setPen` are gone. The pad is open from the first visit, with the photo, the sample and (under the pad) the camera still reachable. The guide is `src/ui/padGuide.ts`: an SVG layer above the canvas (so never in the strokes, Undo or the extractor input) that draws a cat head over 10 s, holds, fades, rests, three times only; the first press removes it. With Reduce motion it is a still, faint, dashed example. The note "Draw your animal here" moves to the bottom of the pad so the guide has the middle. Decision D-050. Update (2026-10-30): the guide now shows three outlines in turn (a sitting cat, an elephant, a dragon), no eyes or nose, one turn each of 7 s, and the line takes 2.3 s to go round (50% quicker than 3.5 s). A small paintbrush follows the line tip (one Web Animations path walk in `padGuide.ts`, in step with the CSS line). With Reduce motion: the still dashed cat only, no brush.

### 12c: Gold that looks like gold PLA

- [x] Replace the flat `#E0A82E` gold in the Puzzle step preview (`src/ui/puzzlePreview.ts`, `FILAMENTS` in `src/ui/presets.ts`) with a **metallic, silk-gold look** like gold PLA filament: warm highlights and deeper amber shadows (SVG gradient across each piece, a soft rim light on the edges), not one flat fill. Take a photo or product shot of the real filament as the reference and match its hue
- [x] **Sparkle**: small glints that twinkle on the gold pieces (four-point stars or soft specks) at seeded random spots, staggered so they do not blink together. Pieces that are still white or tan have no sparkle; the sparkle comes in as a piece reaches gold. With Reduce motion show a few still glints and no animation
- [x] Keep it accessible: the colour name label and the tan stripes still carry the state (no colour-only, DESIGN.md section 9), piece outlines stay clear against the background, and the sparkle never flashes faster than 3 times a second. Sparkle is decoration only: hidden from screen readers
- [x] Apply the same gold to the Print step scene (`src/render/viewer.ts`, `src/render/simulation.ts`) so the colour matches: a physical material with metalness, a clear coat or sheen and a soft environment light. The viewer draws on demand, so keep the 3D look still (no continuous sparkle loop) unless it can be done without keeping the page redrawing
- [x] Check cost: the Puzzle step with 24 pieces must stay smooth on a modest laptop (CSS animation on a few glints, not a per-frame redraw of the whole picture); update the e2e idle-frame checks if they assume the picture is static; screenshots before and after, and a note in DESIGN.md of the gold recipe

### 12d: Remove Replay (and Move the cut points)

- [x] Remove the **Replay** button on the Puzzle step (`id="replay"`, `shell.ts` ~238, handler ~1605, hidden logic ~880) and the replay icon if nothing else uses it. The animation still plays once on arrival and stays gold; Reduce motion still shows the all-gold puzzle at once. Check where else `startReveal` is called (changing the number of pieces or the cut still restarts or ends it, per 10c) and keep that
- [x] **Move the cut points**: already task 11e above. Do not duplicate it; confirm it has really landed in the code (`steer`, `Done moving`, drag handles, the notice about cut points going back to automatic, and `points` in saved projects). If any is left, finish 11e under that item
- [x] Update e2e tests that click Replay; the laptop "fits without scrolling" test still has to pass, and the Puzzle step layout (D-041) may free up space: look at it in the review
- [x] Record the removal in docs/DECISIONS.md (reverses the Replay part of D-037)

### 12e: Gold loses "(glossy)", and the Puzzle step shows the white, tan, gold progression

- [x] Drop **(glossy)** from the gold's name: `FILAMENTS` in `src/ui/presets.ts` (~32, also its comment) and the e2e check in `e2e/smoke.spec.ts` ~77 that expects `Gold (glossy)`. The word is just **Gold** everywhere (Puzzle step, Print step, reports, docs/DESIGN.md). The glossy look now comes from the picture itself (12c), not from the label
- [x] Show the **progression white, then tan, then gold** as a visible hierarchy on the Puzzle step, instead of the plain count line (`bedLabel`, `shell.ts` ~731, which lists Gold, Tan, White in that order). Idea to test in the design review: a small three-step ladder or ribbon under the preview, left to right **White, then Tan, then Gold**, with a little arrow or chevron between steps and a count under each step (for example 4, 5, 3), so a student reads it as "pieces move up from white to tan to gold". The step the animation is working on gets a clear marker, and the finished state highlights Gold
- [x] No colour-only state (DESIGN.md section 9): each step has its name, its own swatch with the same texture it has on the pieces (tan stripes, gold sparkle from 12c), a number, and a shape or marker for "current" and "done". The order must also be said to a screen reader (an ordered list, "step 1 of 3"), and the live status still announces when all pieces are gold
- [x] Use the same three-step ladder on the Print step for the three prints (white, then tan, then gold; the current print marked), so both steps show the same idea. Decide in the plan whether to build it as one shared component
- [x] Respect Comfort: with Reduce motion the ladder shows the final state at once (all pieces at Gold) with no animated fill; high contrast and larger text must not clip the labels. Keep the Puzzle step fitting at the four laptop sizes without scrolling (D-017); the ladder replaces the old count line, so it should not add height
- [x] Update `docs/DESIGN.md`, add a D-0xx entry, and the e2e tests that read the old count line (`bedLabel`) or the colour names; screenshots before and after


Review (2026-10-30, 12c to 12e): built in a separate worktree (the M16 session was editing the main checkout). Gold in the Puzzle step is a gradient plus rim light plus one glint per gold piece (CSS, 3 to 4.6 s each, still with Reduce motion); the Print scene gives gold a physical material (`render/finish.ts`). Replay is gone. The gold is named "Gold". The ladder (`src/ui/ladder.ts`) is one component used on both steps: its own row on the Puzzle step, over the printer on the Print step (a square preview had no room for it inside). Open: the gold hue was not matched to a photo of the real filament; "Move the cut points" is confirmed gone from the code (11e, D-043). D-051, DESIGN.md section 26.

## M13: Drop projects, one STL named after the animal (done 2026-10-30)

Requested by the user: the final goal is **one STL file, named after the animal**. Plan first (plan mode), record the removal in docs/DECISIONS.md (reverses M7b / F-19 and, if it goes too, M8b / F-27). Check `git status` before starting.

### 13a: Remove the project feature

- [x] Remove the **Project** button (`id="project-open"`, `src/ui/shell.ts` ~206), the Your project dialog (`#project-dialog`, ~279), Save my project and Open a saved project (`#project-save`, `#project-load`, the hidden `#project-file` input, the notice, and their handlers ~1440), plus the folder / box icons if nothing else uses them
- [x] Remove `src/core/project.ts` (`Project`, `serializeProject`, parse, migration of version 1 and 2 files) and `project.test.ts`, once nothing imports it. The user keeps nothing between visits, which also fits the privacy rule: nothing about a child's drawing is stored
- [x] **Class batch**: it is built on projects (`src/core/export/batch.ts`, `src/ui/batch.ts`, the Class batch part of the dialog ~287, the batch tests, and the batch name settings in Teacher options, `cleanFileName` and `DEFAULT_FILE_NAME` in `src/ui/teacher.ts`). It cannot work without saved projects and is a second route to the single STL, so the default is to **remove it too**. Open point to confirm in the plan: remove the batch, or keep a batch that is made some other way (a list of animals added in one session)
- [x] Remove the session-storage batch (`hane.batch.v1`) and anything that reads it; check Teacher options for settings that only served projects or the batch, and keep the ones the STL still needs (gap, tab amount, size cap, magnet pocket fit, bottom edge relief)
- [x] Update `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md` and the CLAUDE.md project status (they mention save / open and the class batch), and the e2e tests that open the dialog or use the batch

Review (2026-10-30): see D-046. Projects, the class batch and the Teacher file name are gone (batch removed, as the plan's default); the old session entry is cleared on start. `fflate` is now unused.

### 13b: The STL is named after the animal

- [x] The Print step downloads **exactly one file: `<animal name>.stl`**. Today `saveFile()` (`shell.ts` ~1511) builds `fileBase(pieceCount)` and saves `${base}.stl`; change the base to the Animal name box from the Puzzle step, cleaned for a file name (reuse or move `cleanFileName`: lower-case or keep the spelling, remove `/ \ : * ? " < > |`, spaces and dots at the ends, and Windows reserved names such as `con`; keep a sensible length)
- [x] The name is **required** (decided 2026-10-29): there is no silent default file name. The empty-name case is handled by 13c below
- [x] Show the file name on the Print step next to the Download button so the student sees what they get (the words rule applies: only the name, no extra copy). Update the saved-notice text (`Saved … .stl. Give it to your teacher…`)
- [x] Keep the rule that export is the whole puzzle as one STL, never per-piece files; same seed and settings still give byte-identical output
- [x] Tests: unit test the file-name cleaning (spaces, symbols, empty, very long, reserved names, non-Latin names); e2e: type an animal name, download, check the file name

### 13c: Animal name is required, asked for before the download

- [x] The Animal name box on the Puzzle step (`#animal-name`, `shell.ts` ~557) is no longer optional: remove "(optional)" from its placeholder and any copy that says so. It is the file name, so say that in its accessible name only if the words rule allows (one short label)
- [x] If the name is empty (or only spaces or symbols that clean to nothing) when the student presses **Download** on the Print step, **do not download**. Open a small dialog **in the middle of the screen** with a text box asking for the animal's name, a Save button (disabled until there is a usable name) and a Cancel button. When confirmed, copy the name into the Animal name box so the two stay the same, then run the download. Enter in the box confirms, Escape cancels
- [x] Build it like the other dialogs (the native `<dialog>` with `aria-labelledby`, as `#project-dialog` and Teacher options do): focus goes to the text box when it opens and returns to the Download button when it closes, the box has a visible label (not placeholder only), opaque panel behind the text, works with Comfort settings (larger text, high contrast, reduced motion), and it fits on phone width
- [x] Show the problem in words when the name cannot be used (for example only symbols): a short message next to the box, not colour alone. Use the same file-name cleaning as 13b, and show the final file name (`<name>.stl`) in the dialog so the student sees what they get
- [x] Decide in the plan whether to ask earlier as well: Next from the Puzzle step with an empty name could focus the name box instead of waiting until Download. Default: only ask at Download, as requested, so students are not blocked while they are still trying out pieces
- [x] Tests: e2e: empty name then Download shows the dialog and no file is saved; entering a name saves `<name>.stl`; Cancel and Escape save nothing; a name typed earlier skips the dialog; the dialog is keyboard-operable. Update the existing e2e tests that download without a name

Review (2026-10-30): see D-046 and D-047. Three commits: 13a (projects, batch and the Teacher file name removed, `fflate` dropped), 13b (`animalFileName` keeps the spelling in any language, shown beside Download), 13c (the name is required, asked for in a dialog at Download). Kept spelling as typed, per the user. A phone hides the file name next to the button (no room); the dialog and the a11y and responsive checks cover phones and tablets.

## M14: Cap at 16 pieces (done 2026-10-30)

Small change. Check `git status` first.

- [x] Set `MAX_PIECES` to **16** (`src/ui/presets.ts` line 2, now 60). The slider (`#pieces`, `max="${MAX_PIECES}"`, `src/ui/shell.ts` ~555) and the − / + stepper follow it, so the slider's last stop is 16 and `clampPieces` stops at 16. `MIN_PIECES` stays 2
- [x] Anything that can bring in a bigger number must clamp too: the default count, a count carried over from an older session, the Teacher options size cap, and the gap test print. Check that the default and the Easy / Medium / Tricky presets (6 / 12 / 24, if they still exist after 11d) do not go above 16: the Tricky 24 would no longer be reachable, so drop or change it
- [x] Update the tests that use a larger count: `src/ui/presets.test.ts` (`clampPieces(1000)` still expects the cap), `e2e/keyboard.spec.ts` ("All 24 pieces are gold", line 97), the 24-piece fit check in the e2e "fits without scrolling" test and the property tests for 6 / 12 / 24 pieces (10e), and the speed notes
- [x] Update `docs/PRD.md` (F-15 "about 24+"), DECISIONS.md (a short D-0xx entry: why 16, for example fewer and bigger pieces for ages 5-16 and magnets that fit) and any copy that says more than 16
- [x] Verify the slider in the browser: the thumb reaches 16 at the right end, the live number reads 16, + is disabled or does nothing at 16, and the Puzzle step still fits at the four laptop sizes

Review (2026-10-30): see D-045. `MAX_PIECES` 16; the unreachable "lot of small pieces" warning removed; e2e warning checks now use a 10 cm size cap. Core generator and gap test unchanged.

## M15: Always close an open shape (done 2026-10-30)

Check `git status` first. Students should never be told to join the line up themselves: if the line has a gap, the app closes it.

- [x] Never show **"The line has a gap I can't close. Tap Draw on screen and join the line up."** again (`showSketchStatus`, `src/ui/shell.ts` ~602-609). Remove the `problem === 'open'` notices for the `draw` and photo sources, including "Draw over the gap with a pen and take the photo again." and "Try Gaps: Auto, or Big."; remove `'open'` from `OutlineProblem` once nothing returns it
- [x] Close the gap in the extractor (`OutlineExtractor.run`, `src/core/outline.ts`): when none of the `RADII` for Gaps: Auto closes the shape (`silhouette.closed` false), do not give up. Fall back to bridging the gap: join the two nearest loose line ends with a straight segment (or take the convex hull of the ink only across the gap) so the silhouette flood-fill gets a closed boundary, and use the result. Keep it pure TypeScript with no DOM (`src/core/` rule) and deterministic
- [x] Decide in the plan how the bridge is chosen: nearest pair of ink endpoints (skeleton ends), a larger last-resort radius, or bridging the largest loop's own gap. Also decide which gaps are too wild to bridge (a line that is clearly several separate scribbles): those still need a friendly message, but one that does not ask the student to join the line up (for example the existing "I can't see a drawing" wording)
- [x] For **Draw on screen**: the strokes are known, so close the shape directly before extraction (join the first and last points of the outline, or the free ends of separate strokes) and add that bridge to nothing the student sees except the blue outline. It must not be added to the strokes, Undo, or a saved project
- [x] Keep the existing good message when a gap was closed: "Found your animal! I closed a gap in the line. Press Next if the blue line looks right." should also appear for the bridge, so the student can see the blue line and judge
- [x] Gaps: Small and Big (Teacher options and the three controls) must also close instead of reporting an open shape
- [x] Tests: unit tests in `src/core/outline.test.ts` with a drawn animal that has a gap bigger than the 0.05 radius (expects `ok`, closed shape, area close to the full shape, deterministic); sketch-pad stroke tests that an unclosed loop gives a closed outline; e2e that drawing an open shape on screen and Next works with no "can't close" text anywhere. Update any existing test that expects the `open` problem
- [x] Check the pieces and STL still validate on a bridged outline (the property tests: valid, non-overlapping, manifold, fits the plate)
- [x] Record in docs/DECISIONS.md (reverses the "ask the student to close it" behaviour)

Review (2026-10-30): see D-048. Gap radii widened for all three settings, a skeleton-end bridge for gaps too wide to thicken shut, and the pad closes a single open stroke straight. Measured overlap with the true shape: 0.97 (gap 40 px radius), 0.95 (60), 0.88 (90). Found by testing: two gaps split a shape into two arcs, so ends of different pieces are paired first (pairing the ends of one arc gave overlap 0.38). Also fixed a tab-stop error in the end detection (a stair-stepped skeleton tip has two neighbours).

## M16: Send each class's puzzles to a folder named by the class code (plan, logged 2026-10-30, revised the same day, not started)

Goal: a teacher no longer downloads and forwards every STL. Pressing **Download** asks for a class code, saves the file, and sends a copy to an inbox where every class code is its own folder. The owner opens that inbox from anywhere and downloads or deletes. This is the first thing that would send data off the device, so it is a **narrow reversal of D-001** (D-049; D-048 was taken by M15).

Decided by the owner (2026-10-30):

- Must work within GitHub Pages (the site stays a static Pages site).
- Download pops up a dialog asking for the **class code**. The file is named `<class code> <animal name>.stl`.
- Class codes are **not preset**. Any code works, and each code is a folder holding one STL per animal design.
- Each STL has a **2D view** saved beside it in the folder.
- Files stay **until the owner deletes them**.

Privacy line, kept hard: the **photo, the drawing and the outline never leave the device**. What is sent is the finished puzzle STL (a silhouette in millimetres), a flat 2D picture of the cut pieces made from that same puzzle, and a small JSON. Nothing is sent unless the student presses the button in the dialog, and the dialog says so.

### How it fits GitHub Pages

Pages cannot receive uploads, so the browser talks straight to a free **Supabase** project (Storage, over plain `fetch`, no library, no payment card). The only code that runs on a server is one small Supabase **Edge Function** for the passcode-protected inbox page (16e). Pages still serves the site and `deploy.yml` still publishes it.

- Why not the others: writing into a GitHub repo needs a secret token, which cannot live in a public site. Cloudflare R2 and Firebase Storage ask for a card or billing. A Cloudflare Worker would be code to keep alive.
- The Supabase URL and "anon" key are meant to be public. Safety comes from storage rules on the bucket: anonymous visitors may **add** files whose path looks like `<code>/<name>.stl|png|json` and whose size is under the cap, and may **not** list, read, overwrite or delete. Listing and downloading go through the Edge Function and are **open to anyone who has the inbox page** (owner, 2026-10-30: only delete needs the passcode). Deleting goes through the same function, which checks the inbox passcode first. The bucket itself stays private, so nothing can be read except through those two doors.
- Costs and risks, stated plainly: the free tier is 1 GB (several hundred puzzles; I have not measured a real STL yet). A free Supabase project pauses after about a week idle, so a scheduled GitHub Action pings it weekly (check current terms). Because any code works and the key is public, someone who finds it could upload junk up to the caps; accepted for now, watch the storage use, and if it ever happens add a small check function in front.

### What the student sees

Download opens one dialog (it replaces "Name your animal", D-047): **Class code** (required, remembered for the tab so a class of children on one laptop need not retype it), **Animal name** (required, filled in if already typed), the file name shown live (`6A Big Cat.stl`), a plain line "The puzzle shape and a flat picture of it are saved online for your teacher. Your drawing and photo stay on this device. Please do not type your own name." (it must not promise that nobody else can see the shape, because the inbox page is open to view), **Download and send** and **Cancel**. The local download happens first and is never blocked by the upload. Then one clear message: sent, or "no connection: your file is saved, try Send again". Next from the Puzzle step is never blocked.

### What is stored

`puzzles` bucket, private. Per animal, three files with the same base name in the class folder:
`<folder>/<file>.stl`, `<folder>/<file>.png` (2D view, about 512 px), `<folder>/<file>.json` (class code and animal name exactly as typed, pieces, seed, settings, app version, time).

- **Folder** = the class code tidied so "6A", "6a" and "6 a" meet in one folder: lower case, spaces removed, characters a file name cannot hold removed, at most 20 characters.
- **Same code and animal twice**: uploads are add-only, so the second one gets a clash reply and the page retries as `… (2)`, `… (3)`.
- Storage keys must be plain ASCII, but D-047 keeps names in any language (大象). Plan: the key is an ASCII form with a fallback, and the exact name lives in the JSON and in the owner page. **Spike first** (16b) to see what Supabase accepts.

### 16a: Decide and record (no code)

- [x] Write D-049 (narrow reversal of D-001: opt-in at Download, class code always required, STL + 2D picture + JSON, no photo, kept until deleted, free-tier limits) and update PRD (purpose, goals, non-goals, F-31, privacy row), ARCHITECTURE and CLAUDE.md privacy line (done 2026-10-30; the in-app privacy wording is part of 16d)
- [ ] **Needs you:** check what SUTD or the school needs when children's work is stored online (a class letter or a line in the teacher notes), and who may use class codes

### 16b: Set up the inbox (config kept in the repo as `inbox/supabase.sql` and a README)

- [x] (done 2026-10-30: project created, anon key received and checked to be role `anon`, project answers) **Needs you:** create the free Supabase project and give me the project URL and the anon key (I cannot sign up for you). Set the inbox passcode there as a **Supabase secret** (you type it in their dashboard). It must **never** go in the repo, the docs, a commit message or the built site: the repo and the Pages files are public, so anything written there is readable by anyone
- [ ] Private bucket, file size cap, allowed types; storage rules as above, as a SQL file I write and you paste (written: `inbox/supabase.sql` and `inbox/README.md`; **needs you:** paste it into Supabase SQL Editor and Run; then I check an add works and a read, list and delete are refused)
- [x] Spike (2026-10-30, against the live project with the public key): ASCII names, spaces and parentheses are accepted; **Supabase itself refuses non-ASCII keys** (`InvalidKey` for `大象.stl`). Key rule: folder `a-z 0-9 _ -` (1 to 24); file base = the class code and animal name with every character outside `A-Za-z0-9._() +-` dropped and spaces tidied; if no ASCII letter or digit is left (大象), the base is `animal-<8 hex of a hash of the name>`. The exact class code and animal name go in the JSON, and the owner page shows those. The local download keeps the real spelling (D-047)
- [x] Add-only rules verified live: add works for stl, png and json; the same path twice gives 409 (clash retry works); upsert, wrong extension, upper-case folder, no folder, nested folder and a wrong file type (`text/html`) are refused; an 11 MB file is refused (cap 10 MB); download, list, sign and delete with the public key all fail. **Left in the bucket by the test:** folder `zztest` with 4 files (delete them in Storage, or with the delete function once it exists)
- [x] Measured 2026-10-30 with the real generator (fish, spider and ellipse test shapes, default settings, seed 1): 6 pieces 0.25 MB, 12 pieces 0.40 to 0.50 MB, **16 pieces 0.51 to 0.64 MB** (10,000 to 12,800 triangles). One puzzle is one copy of the file (the three prints are the same STL, D-038). With a 2D view of about 30 KB and a tiny JSON, one animal is under 0.7 MB, so the free 1 GB holds about 1,500 puzzles. Cap set to **4 MB per file** (`inbox/supabase.sql`; about six times the largest seen). A very detailed real outline could be bigger, so re-check with a real class's files. **Needs you:** run the one-line cap change in the SQL Editor (given in chat), since the bucket was created with 10 MB
- [ ] `.github/workflows/keepalive.yml`: weekly request so the project does not pause
- [ ] Put URL and key in the Pages build as GitHub Actions variables (`VITE_INBOX_URL`, `VITE_INBOX_KEY`); with them unset (local dev, forks) the dialog has **no class code field and nothing is sent**, exactly like today

### 16c: Core pieces (pure, tested)

- [x] `classFolder`, `classFileName`, `inboxBase`, `inboxKey` in `src/core/export/classInbox.ts`, built on a new `tidyFileText` in `fileName.ts` (a missing code or name means "not usable"; ASCII keys with an `animal-<hash>` fallback; every key checked against the inbox's own rule)
- [x] The flat 2D view: `thumbnailLayout` (pure, tested) and `renderPng` in `src/ui/inbox.ts`, which draws the real cut pieces in the three filament colours on a canvas (no `puzzleSvg`: drawing straight to a canvas needs no SVG step)
- [x] `inboxJson` (fixed fields only; a test checks nothing else can slip in). Unit tests: `tests/classInbox.test.ts`, `src/ui/inbox.test.ts`

### 16d: Student side (`src/ui/send.ts` and the dialog in `src/ui/shell.ts`)

- [x] The Name dialog is now the Download dialog when the build has an inbox ("Download your puzzle": Class code, Animal name, live file name, the "saved online for your teacher" note, **Download and send**); without an inbox it is exactly the old "Name your animal". Class code remembered for the tab (`sessionStorage`)
- [x] `sendJob` (`src/ui/inbox.ts`): STL, PNG, JSON in that order with the public key; the STL sent is the saved file byte for byte (an e2e test compares them); a name already taken moves the whole set to "(2)"; a failed try carries on where it stopped; **Send again** sits beside the notice so it adds no height (a first version overflowed the panel at 1366x657 and 1536x730; the laptop test caught it)
- [x] The offline worker only answers same-origin GET requests, so it never touches these POSTs (read in `tools/offline.ts`)
- [x] e2e: `e2e/inbox.spec.ts` (13 tests) against a second build made with `.env.inbox` (a pretend address the tests answer themselves): nothing sent before the button, only the inbox address is contacted, keys obey the inbox rule, other languages, no connection, laptop and phone fit, axe clean. `playwright.config.ts` has a `site` and an `inbox` project
- [x] `deploy.yml` passes `VITE_INBOX_URL` and `VITE_INBOX_KEY` (repository variables) to the Pages build only. **Needs you:** add those two variables in GitHub (Settings, Secrets and variables, Actions, Variables), then push; until then the live site does not send

### 16e: Inbox page and its Edge Function (`inbox.html` in the same site, not linked from anywhere)

Why a server check: a passcode typed into a page and compared in the page's own JavaScript protects nothing, because the site's files are public and anyone can read the code or skip the check. So the passcode is compared **on Supabase** by one Edge Function (`inbox/functions/inbox-admin`), which holds the storage master key and the passcode secret; the page never has either.

- [ ] Edge Function `inbox-admin` with actions `list` and `sign` (short-lived download links), both open, and `delete`, which carries the passcode and is refused without it. Constant-time compare, nothing about the passcode in any reply or log
- [ ] **Brute-force guard** on `delete`: after 5 wrong tries in 15 minutes the function refuses delete attempts for a while (a small attempts table). A short, guessable passcode is the weak point of this design; I will recommend a longer one, but it is your call
- [ ] Page: opens straight to the class folders, then a grid of 2D views with animal name, pieces and time. The passcode is asked for only when someone presses a delete button (kept in memory only, gone on reload)
- [ ] **Delete is anyone-can-reach, passcode-gated**: the delete button is visible, but pressing it asks for the passcode (checked by the function), then a second step that names what goes ("Delete class 6a: 24 files? Type 6a to confirm"), because deleting is permanent and kids' laptops can open this page. Delete one animal (its three files) or a whole class
- [ ] Viewing and downloading need no passcode. Known cost, accepted by the owner: anyone who finds the inbox page (the repo is public, so its address is findable) can list every class folder and download every STL and 2D view. Those hold puzzle shapes and animal names only, no photos, which is why this is tolerable. If it ever worries you, putting a passcode on viewing is a small change in the function
- [ ] Download one STL, tick several, or **Download class as ZIP** (re-add `fflate`)
- [ ] Stage 0, before this page exists: use Supabase's own Storage browser with your Supabase login (it previews the PNGs and downloads files), so collecting can start after 16b and 16d

### 16f: Tests and checks

- [ ] Unit tests for the folder and file name rules (case, spaces, symbols, other languages, empty), the SVG and the JSON
- [ ] e2e with the inbox mocked: no key configured gives no class code field and **no network request**; configured, the requests go only to the inbox, carry exactly the STL, PNG and JSON, and no image bytes from the photo or sketch (the privacy test); clash retry; a failed upload still downloads; Cancel sends nothing
- [ ] Update the existing e2e and unit tests that assume Download asks only for the animal name (D-047)
- [ ] a11y, "fits without scrolling" at the four laptop sizes, tablet and phone for the new dialog
- [ ] Edge Function tests: list and sign work with no passcode; delete with no passcode, a wrong passcode or a passcode of the wrong type is refused; the right passcode works; the lock after repeated wrong tries; deleting one animal removes its STL, PNG and JSON and nothing else; nothing in any reply contains the passcode
- [ ] e2e for the inbox page with the function mocked: the delete button shows, a wrong passcode deletes nothing, the confirm step names the class and needs the typed name, Cancel deletes nothing; a scan of `dist/` finds neither the passcode nor the master key
- [ ] Real run against the live inbox with a test class, check the folder shows in the inbox page, delete it with the passcode, then check it is really gone from Storage

### Still open

1. ~~If the key is set, is the class code required?~~ Yes, always required (owner, 2026-10-30).
2. Real STL size, which decides the cap (measured in 16b).
3. ~~Do viewing and downloading need the passcode?~~ No, only delete does (owner, 2026-10-30). Viewing and downloading are open.
4. The passcode: one shared word is as strong as it is hard to guess, and with the brute-force guard a longer phrase is much safer than a short word. Choose it yourself and keep it out of the repo.

## M9: Real-world validation and release

- [ ] Print a puzzle on a real A1 mini, record settings and results
- [ ] Tune default clearance and minimum features; update DECISIONS.md
- [ ] Trial with real students/teacher; collect feedback
- [ ] Final docs pass, tag v1.0

## Review log

_(add dated entries here as milestones close)_

### M8: extras (2026-10-29)

- Built in five slices, each tested and pushed on its own: gap test print (8a), class batch (8b), move the cut points (8c), works offline (8d), bottom edge relief (8e). Decisions D-031 to D-035 in docs/DECISIONS.md. 3MF colours and interior details were left out on purpose (see the plan above).
- The numbers at the end: 429 unit tests (from 377 before M8) and 66 end-to-end tests (from 55), lint and typecheck clean.
- What testing in a real browser caught that unit tests could not: the offline site found none of its stored scripts and styles because of a "Vary: Origin" header, until `ignoreVary` was added.
- Not checked, and only a person can: a real print of the gap test (with and without relief), dragging cut points and the offline reload on a real tablet or school computer, and "Add to home screen" on an iPad.

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
