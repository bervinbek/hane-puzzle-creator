# Product Requirements: Hane Puzzle Generator

> Status: draft v0.1 · 2026-10-28 · Owner: Bervin
> Source of truth for _what_ we build and _why_. For _how_, see [ARCHITECTURE.md](ARCHITECTURE.md). For open decisions, see [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).

## 1. Purpose

A static website (GitHub Pages, no backend) that turns a student's hand-drawn animal outline into a **3D-printable jigsaw puzzle**:

1. Take an image of the drawing (photo of a whiteboard/paper, or draw in-app).
2. Tidy the wobbly line into a clean closed silhouette.
3. Split it into _N_ interlocking pieces (N chosen by the user) with tabs/blanks.
4. Export **3 mm-thick STL** with print clearance, sized to fit a **Bambu Lab A1 mini** (180 × 180 × 180 mm build volume).
5. Show a realistic 3D preview of the puzzle being printed on an A1 mini.

## 2. Context (from the product-rollout slide)

| Slide point                                                                                         | Implication for the product                                                                                                                                          |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Easy for teacher-led"                                                                              | A teacher drives the tool in front of a class. Few clicks, sensible defaults, big targets.                                                                           |
| "Low maintenance"                                                                                   | Static site, no accounts, no server, no database. Nothing to keep alive.                                                                                             |
| "Target audience: age 5-16"                                                                         | Two ends of the spectrum: 5-year-olds (chunky pieces, few of them) and 16-year-olds (many pieces, finer control).                                                    |
| Workflow: 1. Sketch their animal, 2. 3D print the puzzle*, 3. Teacher awards puzzle                 | The UI mirrors these three steps. The `*` on "3D print" suggests print time/logistics is a known constraint, so we surface print-time estimates.                     |
| "Draw your team's favourite animal" box + "Circle your team colour" (yellow, blue, tan, brown, red) | Team colour is part of the workflow. Candidate feature: colour tagging per puzzle (see F-20). Five colours vs the A1 mini AMS lite's four slots is an open question. |
| Example: crane-shaped puzzle, two wood tones, jigsaw knobs, on a whiteboard stand                   | Target look: organic silhouette, classic jigsaw tabs, warm wood-like finish.                                                                                         |

## 3. Users

- **Teacher/facilitator (primary operator):** runs the tool, prints, awards puzzles. Comfortable with a laptop, not with CAD.
- **Student (ages 5-16):** draws; may watch or play with the 3D preview. Sometimes uses the tool directly on a tablet.
- **Maintainer (Bervin):** wants a repo that deploys itself and rarely breaks.

## 4. Goals and non-goals

**Goals**

- Photo-to-STL in under 2 minutes for a typical drawing.
- Printable on an A1 mini with no manual CAD repair, and pieces that fit together by hand without sanding at default settings.
- Works offline-ish and on school hardware (Chromebooks, iPads, older laptops).
- Children's drawings never leave the device.

**Non-goals (v1)**

- Slicing to G-code, or sending jobs to the printer (the user opens the STL in Bambu Studio).
- Accounts, cloud storage, galleries, sharing drawings.
- Supporting printers other than the A1 mini (kept possible by isolating printer constants, but not a goal).
- Hand-editing individual piece shapes.

## 5. Feature list (MoSCoW)

### Must have

| ID   | Feature                               | Notes                                                                                                                                  |
| ---- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| F-01 | Image input: upload, drag-drop, paste | PNG/JPG/HEIC-if-browser-supports. Downscale to ~1600 px long side.                                                                     |
| F-02 | Outline extraction and tidy-up        | Threshold, close gaps, fill silhouette, drop stray marks, smooth, simplify. Sliders for threshold, gap-closing, smoothness.            |
| F-03 | Piece-count input                     | Slider/stepper, live preview. Range 2-60, with a "too small to print" warning.                                                         |
| F-04 | Puzzle generation                     | Organic partition (Voronoi-based) of the silhouette into N pieces of roughly even area. Deterministic from a seed; "shuffle" re-rolls. |
| F-05 | Interlocking tabs/blanks              | Classic jigsaw knobs on every sufficiently long shared edge.                                                                           |
| F-06 | Print clearance                       | Gap between pieces, default 0.3 mm total (0.15 mm per side), adjustable.                                                               |
| F-07 | 3 mm extrusion + STL export           | Binary STL, mm units, Z-up, one shell per piece, combined and per-piece (zip).                                                         |
| F-08 | Fit to A1 mini bed                    | Auto-scale so the whole assembled puzzle fits within the plate with margin. Hard cap at 180 mm.                                        |
| F-09 | Realistic A1 mini 3D render           | Dedicated task. See [PRINTER_MODEL.md](PRINTER_MODEL.md).                                                                              |
| F-10 | Print simulation                      | Pieces build up layer by layer on the model's bed with correct A1 mini kinematics (bed moves in Y, toolhead in X, gantry in Z).        |
| F-11 | GitHub Pages deployment               | GitHub Actions build + deploy on push to `main`.                                                                                       |

### Should have

| ID   | Feature                                   | Notes                                                                                                           |
| ---- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| F-12 | In-app sketch pad                         | Draw with finger/pen/mouse, mirroring the "Draw your team's favourite animal" box on the slide.                 |
| F-13 | Perspective correction                    | 4-corner drag to un-skew a whiteboard photo.                                                                    |
| F-14 | Camera capture                            | Take the photo straight from a tablet/laptop camera.                                                            |
| F-15 | Difficulty presets                        | Easy (about 6 big pieces, chunky tabs), Medium (about 12), Tricky (about 24+).                                  |
| F-16 | Printability report                       | Piece count, smallest feature, tab neck width, est. filament (g) and print time. Warnings, not silent failures. |
| F-17 | Kid mode vs Teacher mode                  | Kid: three big steps, presets. Teacher: clearance, seed, tab style, export options.                             |
| F-18 | Exploded/assemble animation in the viewer | Helps students see how the pieces connect.                                                                      |
| F-19 | Project save/load                         | JSON file (settings + seed + the cleaned outline). The raw photo is optional.                                   |
| F-20 | Team colour tag                           | Pick one of the five slide colours; used for the piece tint in the viewer and for file names.                   |

### Could have

| ID   | Feature                              | Notes                                                                               |
| ---- | ------------------------------------ | ----------------------------------------------------------------------------------- |
| F-21 | 3MF export with per-piece colours    | For AMS lite multi-colour. Needs the colour-count decision.                         |
| F-22 | Tolerance calibration print          | Small 3-piece test coupon to find the right clearance for a given printer/filament. |
| F-23 | Edge chamfer/elephant-foot relief    | 0.2-0.4 mm bottom chamfer so pieces release and slot together more easily.          |
| F-24 | Engraved team initial on piece backs | Needs 3D boolean text; defer.                                                       |
| F-25 | Interior details                     | Closed shapes inside the outline (eye, spots) become holes or shallow engraving.    |
| F-26 | Seed editing                         | Drag Voronoi seeds to steer where the cuts fall.                                    |
| F-27 | Batch mode                           | Queue several team drawings, export one zip.                                        |
| F-28 | PWA/offline install                  | Reliable in classrooms with poor Wi-Fi.                                             |
| F-29 | Frame/tray backing                   | Optional base so the finished puzzle can be displayed.                              |
| F-30 | i18n                                 | EN first; others later.                                                             |

### Won't have (v1)

G-code generation, direct printer control (LAN/Bambu Cloud), user accounts, server-side processing.

## 6. Constraints that shape everything

| Constraint        | Value                        | Why                                                                                       |
| ----------------- | ---------------------------- | ----------------------------------------------------------------------------------------- |
| Build volume      | 180 × 180 × 180 mm (A1 mini) | Hard limit on assembled puzzle size. See sources in [PRINTER_MODEL.md](PRINTER_MODEL.md). |
| Puzzle thickness  | 3.0 mm                       | Requirement. Equals 15 layers at 0.2 mm.                                                  |
| Nozzle            | 0.4 mm (stock)               | Minimum feature size is about 3× nozzle (1.2 mm); tab necks wider than that.              |
| Clearance default | 0.3 mm total                 | Starting point; validate on a real printer (F-22, M8).                                    |
| Hosting           | GitHub Pages (static)        | No server code, relative asset paths, correct `base` in Vite.                             |
| Privacy           | Images stay in the browser   | Subjects are minors. No upload, no analytics that capture images.                         |

## 7. Success criteria

- A teacher with no training goes from drawing to downloaded STL in under 2 minutes.
- At least 9 of 10 realistic test drawings (see `tests/fixtures/drawings/`) yield a valid outline with at most two slider adjustments.
- Every generated puzzle: all pieces are single, valid, non-self-intersecting shells; no piece below the minimum area; whole puzzle within the plate.
- **Physical acceptance:** a puzzle printed on a real A1 mini assembles by hand without sanding or cutting, and pieces are not fused, at default settings.

## 8. Risks

| Risk                                                                           | Mitigation                                                                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Messy photos (glare, shadows, thin pen lines, open outlines)                   | Illumination normalisation, gap closing, in-app sketch pad as a fallback, clear failure messages. |
| Voronoi cells split into disconnected fragments by thin features (legs, tails) | Detect and merge fragments into neighbours; unit tests on concave fixtures.                       |
| Tabs collide with thin regions or the outline                                  | Check each tab against both pieces; drop or shrink it if it does not fit.                         |
| Clearance wrong for real prints (elephant foot, material shrinkage)            | Calibration coupon, adjustable setting, document slicer tips.                                     |
| Pieces fuse on first layer                                                     | Optional chamfer (F-23), larger default clearance for the bottom layer, slicer guidance.          |
| Realistic printer model is a time sink                                         | Own dedicated milestone (M5), procedural build first, polish later.                               |
| Print time too long for a classroom                                            | Time estimate (F-16) and a size cap suggestion.                                                   |
| Trademark/copyright of the printer model                                       | Build an original model from public dimensions and photos; no Bambu logo, no copied CAD.          |
