# Decision Log

Newest at the bottom. Format: context, decision, consequences. Reversing a decision means adding a new entry that supersedes the old one, not deleting it.

## D-001: Fully client-side static site

**Context:** Deploy on GitHub Pages; "low maintenance"; subjects are minors.
**Decision:** No backend. All processing in the browser (Web Worker for geometry).
**Consequences:** Drawings never leave the device. No accounts, no storage. Compute is limited to the user's device, so the algorithms must be light.

## D-002: Vite + TypeScript (strict) + Three.js, minimal UI framework

**Context:** Needs a 3D viewer, a geometry-heavy core and a simple three-step UI.
**Decision:** Vite, TypeScript, Three.js. Vanilla TS UI to start; Preact only if state becomes unwieldy.
**Consequences:** Small bundle, easy Pages deploy. Revisit at M0 if the UI grows.

## D-003: `core/` is pure and DOM-free; all units millimetres; Z-up in XY plane

**Context:** Same data feeds the exporter, the viewer, and the print sim.
**Decision:** One geometry model in mm, Z-up, centred on the origin in XY, bottom at Z = 0. Y-up conversion happens only in `render/`.
**Consequences:** Exported STL needs no transform; core can run in a worker and in Node tests.

## D-004: Organic Voronoi partition, not a regular grid

**Context:** Silhouettes are animals; a rectangular jigsaw grid would not follow the shape.
**Decision:** Area-balanced Voronoi cells (Lloyd-relaxed seeds) clipped to the outline, with fragment merging for concave shapes.
**Consequences:** Natural-looking pieces; extra work for disconnected fragments (see ARCHITECTURE 5.2).

## D-005: Clearance by pre-growing the outline by c/2 then insetting every piece by c/2

**Context:** Neighbouring pieces need a gap, but the silhouette should match the drawing.
**Decision:** Total gap c (default 0.3 mm). Outer boundary unchanged.
**Consequences:** Needs a robust polygon offset library (Clipper2). Value must be validated on a real printer.

## D-006: Seeded determinism

**Decision:** All randomness from a seeded PRNG; the seed is saved with the project.
**Consequences:** Reproducible STLs, golden-file tests, shareable settings.

## D-007: STL first, 3MF later

**Decision:** Binary STL (combined and per-piece zip) in v1. 3MF with per-piece colour is a later feature.
**Consequences:** Simple, universal. Multi-colour requires painting in Bambu Studio until 3MF lands.

## D-008: Print simulation is a visual approximation, not a slicer

**Decision:** The sim generates plausible perimeters + infill per layer to drive the animation. Real slicing stays in Bambu Studio.
**Consequences:** Keeps scope tractable; the UI must say the preview is illustrative.

## D-009: Original procedural printer model

**Decision:** Model the A1 mini from public dimensions and photos as an original asset; no Bambu logo, no copied CAD.
**Consequences:** Avoids trademark/copyright problems; more modelling work (see PRINTER_MODEL.md).

## D-010: Default plate usage 170 × 170 mm, hard cap 180 mm

**Decision:** 5 mm margin per side by default.
**Consequences:** Leaves room for purge/skirt behaviour and edge inaccuracies. Subject to Q2 and Q3.

## D-011: Repository is `bervinbek/hane-puzzle-creator`

**Decision:** Code lives at https://github.com/bervinbek/hane-puzzle-creator (note: "creator", not "generator"). The Pages workflow reads the repo name, so `BASE_PATH` becomes `/hane-puzzle-creator/` automatically.
**Consequences:** Live at https://bervinbek.github.io/hane-puzzle-creator/.

## D-012: Neurodivergent-friendly UI is a hard requirement, not a polish item

**Context:** The audience is ages 5-16 and includes neurodivergent students (stated by the owner on 2026-10-28).
**Decision:** The glass look must never cost legibility or calm. Rules are in docs/DESIGN.md section 9. A "Comfort" control (calm mode, reduce motion, one step at a time, text size, reading font, spacing, contrast) ships in v1 (see M7 in tasks/todo.md).
**Consequences:** Text panels are mostly opaque; glow, flashing and autoplay are out; every design option is judged against these rules.

## D-013: Visual direction is "A · Workshop glass"

**Decision:** Chosen by the owner on 2026-10-28 from four options. Warm peach background with soft colour blobs, frosted cream panels, wood-tone pieces, Fredoka headings and Atkinson Hyperlegible body text, red primary button. Applied to the app shell, including the Comfort dialog (calm mode, reduce motion, text size).
**Consequences:** Rejected directions B (Aurora), C (Sketchbook) and D (Night lab) stay on the design canvas for reference only. Nunito was replaced by Atkinson Hyperlegible.

## D-014: Workshop glass layout, Sketchbook colour scheme

**Context:** After picking A (D-013) the owner preferred the colours of C and asked for continued iteration focused on the 5-16 audience and intuitiveness (2026-10-28).
**Decision:** Keep A's positions, layout and fonts (Fredoka headings, Atkinson Hyperlegible body). Use C's palette: cream paper with a faint grid, lemon/mint/pink/sky highlighter smudges, ink `#2B2D42`, blue `#2F5BEA` primary button, pastel puzzle pieces with ink outlines. Team colours stay as the five slide colours.
**Guided-flow rules added:** later steps stay closed until a drawing is picked, and the page says why instead of failing silently; each step says "Step N of 3 · what to do"; completed steps show a tick; the preview reacts instantly to every control (piece slider, difficulty, shuffle, team colour); "Soon" options explain themselves instead of being dead buttons; focus moves to the step heading on step change; native radios and a native range slider give keyboard support for free.
**Consequences:** The example puzzle is a sample fish cut with Voronoi cells (real seed placement and Lloyd relaxation from `src/core`); it is labelled as an example until M1-M2 use the student's drawing.

## D-015: M1 outline pipeline runs on the main thread (for now)

**Context:** ARCHITECTURE.md planned a Web Worker for geometry. The M1 pipeline on a 900 px photo takes about 45 ms to prepare and about 200 ms per control change on a laptop-class CPU.
**Decision:** Photos are scaled to 800 px on the long side and traced on the main thread, throttled to one run per animation frame. `src/core` stays DOM-free, so moving it into a worker later is a wrapper, not a rewrite.
**Consequences:** Sliders feel fine on a laptop; revisit with a worker if Chromebook testing shows jank, and for the heavier M2 geometry.

## D-016: Extracted outline sits on the outer edge of the pen line

**Decision:** The silhouette is the filled region including the line itself (the pen stroke is not subtracted), so a thick marker makes the puzzle about half a stroke larger than the line's centre. Tests compare against the truth grown by half a stroke.
**Consequences:** Simple and predictable. If it matters in print, add stroke-centre correction (erode by half the measured stroke width) in M1 follow-ups.

## D-017: The laptop view never scrolls; tablets and phones scroll naturally

**Context:** Requested by the owner on 2026-10-28.
**Decision:** At 900 px wide or more and 560 px tall or more, the app is exactly one window tall: the panel and preview fill the space between header and footer, the plate is sized from the container (`cqw`/`cqh`), and secondary hints are hidden on shorter windows. Below that the layout stacks and scrolls, with the preview first on steps 2 and 3. Enforced by Playwright tests at 1280x600, 1366x657, 1536x730 and 1024x690.
**Consequences:** New panel content must fit the budget or hide itself on short windows; the e2e "fits without scrolling" test fails if not.

## D-018: Polygon work uses clipper-lib, in micrometres

**Decision:** `clipper-lib` (Clipper 6, pure JS, zero dependencies) wrapped in `src/core/geometry/clip.ts`, with coordinates rounded to whole micrometres. Replaces the planned Clipper2 port (D-005 still holds; only the library changed).
**Consequences:** Rounding leaves hairline gaps of about a square millimetre in total along a long border and micrometre zigzags at sharp tips; `clean()` and test tolerances account for both. Types are hand-written in `src/types/clipper-lib.d.ts`.

## D-019: Tabs are knob transfers between neighbouring pieces

**Decision:** A tab is one shape moved from one piece to its neighbour with union and difference (see ARCHITECTURE 5.3), not a rewritten edge polyline.
**Consequences:** Exact matching and perfect tiling for free; checks are simple area tests. Only straight shared borders of at least 12 mm get a tab, so very small pieces (about 50 or more on a 17 cm fish) are mostly flat-edged; pieces are still held in place by their neighbours. If that proves too loose in a real print, add tabs on curved borders.

## D-020: Export format, placement and estimates

**Decision:** One binary STL (millimetres, z up, no date in the header so the bytes are reproducible) with every piece as its own closed shell, laid out assembled with its gap, bottom on z = 0 and centred on the origin; plus a zip of one STL per piece (same coordinates, so opening them together rebuilds the layout) and a short readme. File names are `hane-puzzle-<team>-<N>-pieces`. The Print step shows size, plastic ("up to" a fully solid fill, 1.24 g/cm³ PLA) and time rounded to five minutes from a simple model (`TIME_MODEL`: 9 mm³/s average flow, 2 s per layer, 0.3 s per piece per layer, 4 min setup).
**Consequences:** The time model is a guess until calibrated against a real slice; the page says "estimates". A golden-file test pins the exact bytes for the fish, 12 pieces, seed 1; update it only on purpose. Bambu Studio is expected to place the object on the plate automatically; confirm on first real use.

## D-021: The 3D viewer is lazy-loaded, draws only on change, and is fully optional

**Decision:** Three.js lives in `src/render/viewer.ts` and is loaded with a dynamic import the first time someone picks the 3D view (about 140 kB gzipped, separate from the 58 kB main bundle). The view draws a frame only when something changes (drag, slider, resize, new pieces), so an idle view costs nothing and never animates on its own. The camera is an orbit camera with no panning, kept above the plate. Keyboard users turn it with the arrow keys and zoom with plus and minus; "From above" and "Angled" are one-press presets. "Pull apart" slides pieces outward and up; the button-free slider means nothing moves unless the user moves it, and any glide is skipped when Reduce motion is on. If the browser has no WebGL the page says so and stays on the flat view.
**Consequences:** The flat SVG view stays the default and the fallback. The plate here is a simple stand-in; M5 replaces it with the A1 mini model and M6 adds the print animation on the same scene.

## D-022: The printer model is a procedural rig, parked while nothing prints

**Decision:** `src/render/printer/` builds the A1 mini from rounded boxes and cylinders (no assets to download), shaped from the official product photo and the published outside size. The rig is three moving groups: the bed slides in y, the gantry rises in z, the toolhead travels in x. `setPose` takes the nozzle position in plate coordinates and slides the bed the opposite way. Printed pieces are children of the plate group, so they ride with the bed. When nothing is printing the toolhead parks at the right of the plate, out of the way. The 3D view has three presets: Top (plate and puzzle only, the printer hidden), Angle (the plate with the column behind it) and Printer (the whole machine). Calm mode is also the low-quality switch: no shadows, pixel ratio 1.
**Consequences:** The look was checked against one photo, so details are simplified; see PRINTER_MODEL.md section 7. Colours were corrected from my first guess: the real printer is light silver and grey, not black. Room reflections come from three.js's built-in `RoomEnvironment`, not a downloaded HDRI.

## D-023: Printer model revised after owner feedback (proportions, toolhead and arm, spool, views)

**Decision:** L-shaped base with the screen on a lower front-right block; wide gantry carriage; bigger toolhead with a side module, motor and filament; dark column top housing; two cables; the spool and holder removed. The Angle view now frames the whole plate from the front-left; the Printer view matches the product photo's low, front-left angle. Toolhead x travel is limited to -96..90 so it never touches the carriage or the arm end.
**Consequences:** The visual check is still against official photos only, not the physical machine. See PRINTER_MODEL.md.

## D-024: White spool back on; the plate is the standard textured PEI

**Decision:** On request (owner, 2026-10-29): a spool with white filament hangs behind the column and a white tube runs to the toolhead; the filament stays white whatever team colour is chosen (the team colour belongs to the printed pieces). The build plate is drawn as the standard Bambu-style textured PEI sheet: dark charcoal, fine speckle and grain, matte, rounded corners.
**Consequences:** The spool's bracket position is still my reading of the retailer text (it attaches to the column); the plate look follows the real sheet's appearance but no plate branding is drawn.

## D-025: The print simulation squashes finished pieces and draws only the layer in progress

**Decision:** The toolpath is built once per puzzle in `core` (D-008 still holds: illustrative, not a slicer). In the viewer, layers already printed are the piece meshes scaled in z to the height so far; only the current layer is drawn as flat lines (a little wider than the plastic so they do not shimmer, walls darker than fill). Pieces and lines are children of `rig.plate`, so the bed carries them. Pressing Play never starts by itself on arrival; the "Watch it print" button on the flat picture switches to 3D and starts. Pull apart is hidden on the Print step and any pulled-apart pieces are put back before the print starts. From above, the machine is hidden and the plate is held still.
**Consequences:** Cheap enough for school hardware (about 4,000 to 9,000 quads for the live layer (6 to 24 pieces) instead of 55,000 to 137,000 for all layers). The live layer's pattern vanishes into a plain top when the layer finishes, a small visual pop. Speeds are set by how long a whole print takes to watch (150 s, 70 s, 28 s), so a bigger puzzle moves faster on screen, not slower.

## D-026: Drawing on screen feeds the photo pipeline (photo input removed in D-054; the pipeline stays)

**Decision:** The pad is a fixed 800 x 800 canvas of black strokes on white. Confirming the drawing (D-040) hands its pixels to the same `OutlineExtractor` a photo uses, so there is one tracing path, one set of tidy controls and one set of messages (worded for drawing: "tap Draw on screen" instead of "take the photo again"). Strokes are stored as points so Undo is exact and finished strokes are redrawn as smooth curves. The next step stays closed while the pad is open.
**Consequences:** The pad needs a pointer (finger, pen, mouse); keyboard-only and screen-reader users are told so and pointed at the photo and sample options. The drawing is never saved or uploaded, only the traced outline is used (see 7b for saving).

## D-027: A project file holds the outline, never the picture

**Decision:** A saved project is a small JSON file: app name, version, team, piece count, seed and the cleaned outline in mm (plus the sample fish's eye). No photo, no drawing, no name, no date. Opening one replaces the current shape and goes to the Puzzle step. The parser never throws; it returns one of six named problems with a plain sentence for each. Unknown extra fields are ignored so a later version can add to the file; a file from a newer version is refused with a message.
**Consequences:** Privacy holds (drawings are of minors, D-privacy in CLAUDE.md). A project saved from a traced photo cannot be re-traced, only re-cut. The save and open buttons live in one Project dialog in the header, because the step panels have no spare room on a laptop.

## D-028: Teacher options are a dialog, kept on the device, and part of the project

**Decision:** Kid mode is the default and has no extra controls. A "Teacher" button in the header (Q9: one URL, a button, as assumed) opens a dialog with the print gap, tab amount, biggest size (Q2: fit to 170 mm, can be made smaller), cut number and file name. Tab amount changes when an edge gets a tab (fewer: edges from 16 mm and a second tab only above 70 mm; standard: 12 and 45, exactly as before; more: 6 and 22). The size cap only ever scales a drawing down. The settings are saved in the browser, the header says when they are not standard, and the print gap, tabs and size cap are saved in project files so the same project always gives the same STL.
**Consequences:** The laptop layout does not grow. Opening a project replaces the teacher's own settings with the file's. The smallest gap is 0.15 mm (D-026 of the geometry: below that the validator reports pieces as too close). Q2 and Q9 are built to their defaults but still need your answer.

## D-029: Picture tools live under the picture; the camera and straightening stay on the device (removed in D-054)

**Decision:** "Use the camera" and "Straighten the picture" are buttons in a strip under the picture on step 1 (the step panel has no spare room on a laptop). The camera uses `getUserMedia` only after the button is pressed, keeps nothing, and is switched off after one photo. Straightening is a projective map from the four corners the user marks (Heckbert's unit-square-to-quad formula), sampled bilinearly, to at most 800 px, and only offered for photos (a drawing from the pad is already straight). The next step stays closed while a tool is open.
**Consequences:** Nothing leaves the browser. The laptop layout now has one row that fills the window, so the cards no longer change size between steps; previews are larger. The camera needs a secure page (https or localhost), as it does on GitHub Pages.

## D-030: Accessibility is checked by tests that run on every change

**Decision:** Four test files guard the rules in docs/DESIGN.md section 9, so they cannot slip back: axe-core audits every screen and dialog in both looks; a keyboard walkthrough covers order, focus rings, dialogs and the whole flow; device tests check seven tablet and phone sizes with a finger as the pointer for sideways overflow, 44 px targets and (for landscape tablets) fitting without scrolling; motion tests check that reduced motion leaves nothing animated. A skip link comes first on every page. On a touch screen sliders, switches and buttons grow to 44 px; with a mouse they keep their denser size.
**Consequences:** A new control that is too small, has a name that does not match its words, loses its focus ring or animates under Reduce motion fails the build. Automated checks find only part of the problems, so the real-device and screen-reader passes in tasks/todo.md are still needed. Lighthouse itself was not run (no way to run it here); it uses the same axe rules.

## D-031: The gap test is made by the real cutting code

**Decision:** The tolerance coupons are not drawn by hand: each is a small rectangle cut into two pieces by `generatePuzzle` with the real tab code and explicit cut points (a new optional input, also used by "Move the cut points"), so what a teacher tests is what a puzzle gets. Gaps are 0.20, 0.30 and 0.40 mm; notches in the edge of the left piece (1, 2, 3) say which is which, because engraved text is not possible yet (F-24).
**Consequences:** If the tab code changes, the test print changes with it. The result is a recommendation for the Teacher gap setting; the default stays 0.30 mm until a real print says otherwise.

## D-032: The class batch is remade from projects, and lives in the tab

**Decision:** A batch is a list of saved projects (outline, pieces, seed, team, print settings). The zip is made by cutting each one again, so it needs no stored geometry and matches what the Print step would give. It is kept in session storage, not local storage: drawings are of children, and a shared school computer should not keep a class's outlines after the tab is closed. The Teacher file name starts every file name.
**Consequences:** Closing the tab loses the batch (say so in the dialog; the project files in the zip let a teacher reopen any puzzle). Making a zip of 20 puzzles takes a few seconds on the main thread (D-015); the dialog says "Making the zip…" first. Q11 (batch mode) was "not in v1"; it is built because M8 is the extras milestone.

## D-033: Moved cut points are stored in the drawing's own millimetres

**Decision:** The cut points a user moves are kept in the unscaled drawing's coordinates and scaled by the same factor as the drawing when the teacher caps the size, so changing the size does not move the cuts. They are tied to the number of pieces: any change to the count, a shuffle or a new drawing returns to automatic cutting, and the page says so. While dragging, the pieces are re-cut once per frame and only the piece paths are redrawn (not the whole picture), so the dot being dragged keeps the pointer. Moving is only offered on the flat picture of the Puzzle step.
**Consequences:** Cutting takes about 0.07 s for 6 pieces, 0.13 s for 12, 0.25 s for 24 and 0.35 s for 48 on this laptop, so dragging is smooth at low counts and a few frames a second at high ones (a draft cut without tabs while dragging would fix that; not done). Not measured on a school tablet. A dropped dot can leave a piece too small and the usual "fewer pieces" or small-feature notice appears.

## D-034: Offline use is a small worker made at build time, not a library

**Decision:** The site keeps itself on the device with a hand-written service worker (`tools/offline.ts`) that a Vite plugin fills in with the list of the build's files and a version code. No offline library: the worker is about 80 lines, the list always matches the build, and the behaviour is unit tested by running it against a pretend browser and end-to-end in Chromium with the network off. The page is fetched network-first (a slow network falls back to the stored page after 3.5 s); everything else is store-first, because hashed files never change. Stores are matched ignoring "Vary", which a static host can set to Origin. Registration happens only in the production build and only where the browser allows it.
**Consequences:** A new deploy reaches a device on its next online visit (the new worker takes over at once and the previous store is kept for open tabs). Nothing about users or drawings is stored. If a browser blocks workers (some private windows), the site simply needs the network each time. The icons are a small committed picture drawn from the favicon; `node tools/make-icons.mjs` redraws them.

## D-035: First-layer relief is a one-layer step, off by default, and unproven

**Decision:** F-23 is built as the "elephant foot" compensation slicers use: the first layer is drawn smaller by 0.2 or 0.3 mm, with a downward-facing ledge one layer up, instead of a sloped chamfer (a slope would need many thin steps and would not print differently at 0.2 mm layers). It is a Teacher setting, Off by default, so every puzzle made so far is unchanged byte for byte. The 3D view and the print player do not show it (0.2 mm).
**Consequences:** Nobody has printed it yet. The gap test is meant for exactly this: print it Off and Small and compare. If Small helps, the default can change; if it does not, the option can go. Until then it is labelled as something to try with the gap test first.

## D-036: No team colours; the puzzle has an animal name and is shown in three filaments

**Decision:** Reverses the five team colours (Q1 default, "one colour per puzzle"). Students are grouped by the animal they drew, so a project and a batch entry carry an optional animal name (up to 30 characters, trimmed) instead of a team id, and files are named `<teacher name>-<animal>-<pieces>-pieces`. The "Colour:" control is display-only: it lists the three filaments the puzzle prints in (gold glossy, tan, white), each with its name so colour is never the only signal. Project files are now version 2; version 1 files still open, their `team` is ignored and the name is empty. Until 10c and 10d change the pictures, the flat print preview and the 3D scene draw the plastic in gold.
**Consequences:** Filenames that used a team colour now use the animal name, or nothing when it is blank (`hane-puzzle-6-pieces.stl`). A page from before this change refuses a version 2 file with the "newer version" message instead of opening it. The three-prints idea itself (one set per colour) lands in 10d.

## D-037: The Puzzle step is a flat colour animation, not a 3D viewer

**Decision:** Narrows D-021: the 3D viewer is no longer offered on the Puzzle step (M4 put it there). The Puzzle step shows only the top view of the cut puzzle, in three fixed colours instead of the pastel colouring: pieces start white and are upgraded at random (seeded, so repeatable) to tan and then gold, once, and stay gold. A Replay button plays it again; Reduce motion shows gold at once. The orbit, pull-apart slider and Flat / 3D switch are gone from this step. `PuzzleViewer` stays, unchanged apart from losing its pull-apart control in the page, because the Print step still uses it (10d makes that the only view there). The order lives in `src/core/puzzle/reveal.ts` (pure, tested); the page only plays it.
**Consequences:** Piece neighbours are no longer told apart by colour on the Puzzle step: the drawn cut lines do that. The greedy colouring in `core/puzzle` is no longer used by the page (kept and tested; remove if nothing needs it by M9). `viewer.setExplode` is now unused by the UI.

## D-038: The Print step is always the printer, and the puzzle is printed three times

**Decision:** Reverses the Flat / 3D switch and the "Watch it print" button (M6): the Print step always shows the A1 mini and starts printing when you arrive (never with Reduce motion). The same puzzle file is printed three times, white then tan then gold, each on a cleared plate, because the teacher prints one set per colour. The toolpath did not need a "run" dimension: the simulation replays the one toolpath three times and recolours the pieces and lines for each run (`PrintSimulation.setRunColours`), with the clock per print so a run takes the same time as before (watching all three takes about 2 minutes at Normal, 40 s a print). The per-piece zip is removed (`piecesZip`); the class batch never used it. The report gives plastic and time for one print and for all three (`PRINT_SETS`, `printReport`). The finished sets are not left on the plate between prints, since a real plate holds one set; the status line names the colour instead.
**Consequences:** The only 3D view is on the Print step; if WebGL is missing the Print step shows the flat gold picture with a notice. Filament changes between prints and the plate swap are the teacher's job and are not timed. The slider's layer count is per print.

## D-039: Every piece has a blind pocket for a 6 × 2 mm magnet, from the top

**Decision:** Each piece gets one round blind pocket in its top face, pressed with a disc magnet by hand after printing (no pause-and-insert, no filament change). The pocket sits at the piece's pole of inaccessibility (the point farthest from its edge, found by `core/geometry/polylabel.ts`), so it is clear of the tabs by construction, and it is only made when a circle of the pocket's size fits there with 1.2 mm of wall to spare (the minimum feature size). A piece too small gets no pocket and a warning (`no-magnet-room`); the puzzle stays printable and the page says "N pieces are too small for a magnet. Try fewer pieces." The pocket is part of the core: `Piece.pocket`, drawn by `extrudePolygon` (a 48-sided hole in the roof, an inward wall, a floor), also with the bottom edge relief, in the STL, the 3D scene and the gap test print.
**Starting numbers (guesses, to tune on a real print):** pocket 6.2 mm wide (the **magnet pocket fit** Teacher option, 0.1 to 0.5 mm over the magnet, default 0.2) and 2.2 mm deep, which leaves a floor of 0.8 mm (four layers). A puzzle thinner than the pocket depth plus 0.6 mm is made without pockets. Not yet printed: M9.
**Consequences:** All STL files changed (the golden file was replaced). The print animation grows plain blocks (a pocket cannot be squashed to the printed height) and the pieces with pockets appear when each print finishes; the toolpath still prints the pocket area as solid. Magnet polarity is not chosen anywhere: with one orientation for all pieces they would attract or repel on the table, so pieces should be put in so that neighbours attract, and this is for the teacher to decide (nothing in the page says which way). The Print step counts the magnets needed (pieces with a pocket times three prints); the gap test print carries pockets too, so one print also tries the magnet fit.

## D-040: Next confirms a drawing; drawn pictures start fully smoothed

**Decision:** Narrows D-026: the "Use my drawing" button is gone. The bottom-right Next button is the only way on, on every route: with strokes on the pad it opens, traces the drawing (the same `OutlineExtractor` path as before) and goes straight to Make the puzzle. The step chips do the same, since both go through `go()`. An empty pad keeps Next closed with "Draw your animal to continue"; if no animal can be found the student stays on step 1 with the existing message. Drawn pictures start with "Smooth the wobbles" at 100 (`DRAWN_TIDY` in `core/outline.ts`); photos keep 35. A slider the student moves is kept while they draw more on the same drawing; Back from the puzzle shows the traced drawing with the three controls.
**Consequences:** One predictable layout (D-017): photo, sample and drawing all go on with Next. Checked with a four-legged animal drawn on the pad: thin legs, head and tail survive smoothing at 100. Max smoothing is a default, not a limit: the slider can be lowered when a thin feature is lost.

## D-041: Pieces drift out and back while the Puzzle step upgrades them

**Decision:** Extends D-037. The colour order is unchanged (white, tan, gold, random, seeded). The piece that has just changed colour also drifts straight away from the middle of the puzzle by about 5% of its width (at least 2 mm) and settles back, drawn on top of its neighbours, taking one tick of the animation. Pieces are never really swapped: the cut lines and the finished picture stay exactly as cut. `driftVector` in `core/puzzle/reveal.ts` is the tested helper; `piecePaths` draws the moving piece in a `.drift` group and `app.css` runs the keyframe, only when motion is not reduced (Reduce motion already shows gold at once and has no animation).
**Consequences:** The status line and the colour count still say the state in words. With many pieces a tick is short (50 ms at most 24 pieces and up), so the drift is quick; the pieces still end in place.

## D-042: The animal name is the STL file name

**Decision:** Narrows D-036's file naming. A named animal downloads as just its name: "Elephant" saves `elephant.stl` (lower case, letters and digits, dashes between words; `safeName`). If the teacher has set their own file name in Teacher options it comes first (`class-5b-elephant.stl`). With no name, or a name with no letters or digits, the file keeps the old form: the teacher's file name, the piece count and "pieces" (`hane-puzzle-6-pieces.stl`). The Teacher options note shows the name the next file will get. The project file (`.json`), batch zip and gap test keep their own names.
**Consequences:** Two puzzles with the same animal name and different piece counts download with the same file name; the browser adds "(1)". The piece count is no longer in the name when an animal is named.

## D-043: The Puzzle step loses the Colour list, the difficulty chips and Move the cut points

**Decision:** Three removals from step 2, all asked for by the user. (1) The display-only **Colour:** list (Gold, Tan, White swatches) is gone; the count line ("Gold 6 · Tan 0 · White 0") and the tan stripes already name every state, and `FILAMENTS` stays for the animation and the Print step. (2) The Easy / Medium / Tricky chips are gone (`DIFFICULTIES`, `difficultyFor`, the `level` radios; closes Q5's presets); the one piece-count control (− / number / + and the slider, 2 to 60) now sits centred directly under the preview in the canvas card, not in the side panel, and is shown only on the Puzzle step. On laptops the preview is capped so the preview, the control and the Replay / Shuffle row fit the card without page scrolling (D-017). (3) **Move the cut points** is gone (reverses M8c, F-26 and D-033): the buttons, the draggable dots, the arrow-key editing, the notice and the `seeds` field in saved projects. Older project files that carry `seeds` still open and the field is ignored, so their puzzle is cut automatically. `generatePuzzle` still accepts a `seeds` input because the gap test print (`coupon.ts`) uses it to cut straight down the middle; automatic seeded placement and the byte-identical STL for the same seed are untouched.
**Consequences:** The side panel on step 2 holds only the Animal name, which 11f (the design review) rearranges. A project saved before this keeps its pieces, seed and name but not its moved cuts.

## D-044: Puzzle step layout: the count under the picture, the other controls in the panel

**Decision:** After D-043 left the side panel with one field, step 2 was arranged on purpose (11f). Layout B: the piece count alone sits under the picture; **Replay** and **Shuffle the cuts** move into the side panel under the Animal name; the colour count line stays inside the picture; the hint line is removed (the copy rule: the slider and the picture already say it). Replay is rendered by the panel and hidden through the Comfort setting. The preview card's bottom row (`#preview-actions`) is hidden on this step.
**Consequences:** The picture is larger; M12d (remove Replay) leaves a panel row with only Shuffle, and nothing else changes. New checks: on every laptop size the picture, the count and the panel buttons sit inside their cards with no overflow, and tablets and phones check that the panel and card do not scroll sideways.

## D-045: At most 16 pieces

**Decision:** The piece count runs from 2 to 16 (`MAX_PIECES` in `src/ui/presets.ts`, was 60). The slider's last stop is 16, `clampPieces` cuts any bigger number back to 16 (a project opened from a file, for example), and + does nothing at 16. Reason: fewer, bigger pieces suit ages 5 to 16, print faster, and keep room for each piece's 6 × 2 mm magnet (D-039). The "That is a lot of small pieces" warning (`MANY_PIECES`, 40) can no longer be reached and is removed; the "too small for a magnet" and "Only N pieces fit" notices stay, since a small size cap in Teacher options still makes small pieces. The core cutter, the gap test print (2 pieces) and the class batch are unchanged: the cap is the page's, not the generator's, and closes the range question in Q5.
**Consequences:** The old Tricky count (24) can no longer be chosen. Projects saved with more than 16 pieces open with 16. The e2e checks that needed a warning now use a 10 cm size cap with 16 pieces.

## D-046: No saved projects, no class batch, no Teacher file name; one STL named after the animal

**Decision:** Reverses D-027, the project part of D-028, D-032 and the Teacher file-name part of D-042 (M13). The Project button and dialog, saved project files (`src/core/project.ts`), the class batch (`core/export/batch.ts`, `ui/batch.ts`, the tab's stored list) and the Teacher "File name" prefix are removed, so nothing about a child's drawing is stored or carried in a file: the only thing that leaves the page is the STL. Old project files can no longer be opened; the page clears the old `hane.batch.v1` session entry on start. Teacher options keep the print settings (gap, magnet fit, tabs, bottom edge, size cap) and the cut number; they are remembered on the device, as before. The gap test downloads as `gap-test.stl`. The next slices make the file `<animal name>.stl` (13b) and the name required (13c).
**Consequences:** `fflate` was removed. A teacher who wants a class set collects the STL files themselves. Older stored Teacher settings that carry a `fileName` still load; it is ignored.

## D-047: The STL is named after the animal, and the name is required

**Decision:** Narrows D-042 (M13b, 13c). The Print step downloads exactly one file, `<animal name>.stl`. `animalFileName` (`core/export/fileName.ts`) keeps the spelling the student typed, in any language ("Big Cat" saves `Big Cat.stl`, 大象 saves `大象.stl`), removes what a file name cannot hold (`\ / : * ? " < > |` and control characters), tidies spaces, trims spaces and dots at the ends, cuts to 60 whole characters, and adds " puzzle" to a Windows device name (`con`, `nul`, `com1`...). With no letter or number left it returns nothing, which means the name is missing. The name is required: **Download** with no usable name saves nothing and opens a centred dialog, "Name your animal", with a labelled box, the file name it will make shown live, **Save** (closed, with a message, until the name is usable) and **Cancel**; Enter saves, Escape cancels, and focus returns to Download. A name given there is copied into the Animal name box. The Print step shows the file name next to the Download button (the footer's help slot; hidden on a phone to save room). Only Download asks; Next from the Puzzle step is never blocked.
**Consequences:** The old lower-case dashed names (`hane-puzzle-6-pieces.stl`) are gone, as is `safeName`. Two animals with the same name download with the same file name; the browser adds "(1)". The name is not inside the STL, so the same seed and settings still give byte-identical files.

## D-048: A line with a gap is closed for the student, never reported

**Decision:** Reverses the "ask the student to close it" behaviour (M1, M7a). The outline finder never returns an "open" problem, and the page never says "The line has a gap I can't close", "join the line up" or "Try Gaps: Auto, or Big". Three layers close a gap, smallest first. (1) **The Gaps setting's radius**: the ink is thickened until the outside cannot leak in, then the thickening is undone so the edge sits back on the line; the radius list now runs on to 0.07 of the long side for every setting (Small and Big start at their own radius and carry on). (2) **A bridge between loose ends** (`core/image/bridge.ts`): when no radius encloses a shape, the ink is thinned to a skeleton (Zhang-Suen), short spurs are nibbled off, and the two nearest loose ends are joined with a straight 5 px bridge, ends of different pieces of line first (two gaps split a closed shape into two arcs); this repeats up to four times and then looks again. (3) **The pad** (`closingSegments` in `ui/strokes.ts`): a drawing of one stroke whose ends are apart is closed with a straight line in the copy of the picture sent to the finder; the strokes, Undo and the picture the student sees are not changed. Measured on the test fixtures, the overlap with the true shape is 0.97 for a gap of 40 px radius, 0.95 for 60 and about 0.88 for a gap that removes a third of the line. A drawing with no loop and no loose ends (separate scribbles) says "I can't see a drawing", which never asks the student to join anything. Whenever any of this closed something, the notice says "I closed a gap in the line. Press Next if the blue line looks right.", so the student judges it from the blue line.
**Consequences:** `OutlineResult` gains `bridges` and `OutlineProblem` loses `'open'`. A bridge is a straight cut across the missing part, so a huge gap can cut off part of the animal; the student sees that in the blue line and can draw it again. An open drawing costs a few extra passes over the picture (about 50 to 250 ms), only while the line is open. Nothing about the bridge is stored.

## D-049: Download can send the puzzle to a class folder in a small online inbox (planned, M16)

**Decision:** Narrowly reverses D-001 ("no backend, nothing leaves the device") and changes the Download step of D-047. The site stays a static GitHub Pages site. When the build is given an inbox address and key, **Download** opens a dialog asking for a **class code** (required, always) and the animal name (required, D-047), saves `<class code> <animal name>.stl` on the device first, then sends a copy to a free Supabase Storage project over plain `fetch`, with no server code of our own. Class codes are not preset: any code works, and each code is a folder (tidied: lower case, spaces and unsafe characters removed, at most 20 characters, so "6A" and "6 a" meet). Each animal puts three files in its class folder: the STL (byte-identical to the download), a PNG 2D view of the cut pieces, and a small JSON (class code and animal name as typed, pieces, seed, settings, app version, time). The bucket is private. Anonymous visitors may only **add** files whose path matches `<folder>/<name>.stl|png|json` and is under the size cap; they cannot list, read, overwrite or delete. Listing, downloading and deleting go only through one small Supabase Edge Function. The inbox page is open to anyone: **viewing and downloading need no passcode**, and its delete button is visible to everyone but **delete needs an inbox passcode** held as a Supabase secret (never in the repo or the site, which are public), with a typed confirmation before a delete and a lock after repeated wrong tries. Files stay until someone with the passcode deletes them. A repeat of the same code and animal is saved as `(2)`, `(3)`. A weekly GitHub Actions request keeps the free project from pausing.
**What still never leaves the device:** the photo, the camera picture, the sketch strokes and the traced outline. The 2D view is drawn from the finished puzzle, not from the picture. Nothing is sent before the student presses **Download and send** in the dialog, which says what is sent. With no inbox address and key in the build (local dev, forks), the dialog has no class code field and nothing is sent.
**Consequences:** The privacy line in PRD and CLAUDE.md changes from "never leaves the browser" to "the picture never leaves the browser; the puzzle can be sent to a class folder". The Supabase URL and anon key are public by design; safety rests on the storage rules, and someone who finds the key could add junk up to the caps (accepted; watch the usage, and put a small check function in front if it happens). Because the inbox page is open to view, anyone who finds its address (the repo is public) can see every class folder and download every STL and 2D view: puzzle shapes and animal names, no photos. The Download dialog must say the shape is saved online for the teacher and must not promise it is private. Free tier is 1 GB. The offline worker must not touch these requests. Keys must be plain ASCII while D-047 keeps names in any language, so the exact name is stored in the JSON (checked 2026-10-30: Supabase refuses non-ASCII keys, so the file key is an ASCII form, or `animal-<hash>` when nothing ASCII is left). The existing "Name your animal" dialog and its tests change. Status: the student side is built (class code dialog, upload, Send again; M16c and 16d) but sends nothing until the build is given `VITE_INBOX_URL` and `VITE_INBOX_KEY`; the inbox page and its delete function are still to do (M16e); M16 in tasks/todo.md.

## D-050: One pen size, and the Draw step opens on the drawing pad (M12a, M12b)

**Decision:** The pen has one width (10 pad pixels); the Thin / Medium / Thick choice is removed. The site opens with "Draw on screen" already chosen and the pad showing; Add a photo, Use the sample fish and (below the pad) the camera stay one tap away. An empty pad shows a faint cat head that draws itself, holds, fades and rests, three times, and is removed at the first press. It is a separate SVG layer, so it is never in the strokes, Undo or the picture the outline finder reads. With Reduce motion it is a still, faint, dashed example. The "Draw your animal here" note sits at the bottom of the pad.
**Consequences:** Reverses the pen choice from M7. The pad is created at start-up, so a browser with no 2D canvas now fails at load rather than at the first tap (the e2e no-WebGL test only blocks WebGL). The Pick-a-drawing wording on the blocked Next button now reads "Draw your animal to continue" on first load.

## D-051: Silk gold, no Replay, and the white, tan, gold ladder (M12c to M12e; the ladder was removed in D-055)

**Decision:** The Puzzle step draws gold pieces with a silk-gold gradient, a rim light and a slow glint on each; the Print scene gives gold a physical material (metalness, clear coat). The Replay button on the Puzzle step is removed (reverses the Replay part of D-037): the animation plays once on arrival and stays gold. The gold's name is "Gold", not "Gold (glossy)". The count line is replaced by a three-step ladder, White then Tan then Gold, drawn the same way on the Puzzle step (pieces at each colour, its own row) and on the Print step (the three prints, over the printer). Recipe and rules are in docs/DESIGN.md section 26.
**Consequences:** The Puzzle step gives up about 50 px of picture height for the ladder row. Gold pieces are drawn as several paths (fill, rim, outline, glint), so tests count `path[data-tone]`, not every path. The 3D finish is chosen by comparing a colour to the gold filament's hex, kept equal by a test. Colour is still never the only signal. The gold hue is the filament's `#e0a82e` and has not been matched to a photo of the real spool.

## D-052: The inbox page and its delete function (M16e)

**Decision:** The teacher's inbox is `inbox.html` in the same site (not linked from anywhere, `noindex`, not kept for offline use) and one Supabase Edge Function, `inbox-admin`, written as a single file with no imports (`inbox/functions/inbox-admin/index.ts`) so it can be pasted into the dashboard. Listing and download links need no passcode; deleting needs the passcode, which is compared on the server (a Supabase secret, `INBOX_PASSCODE`, at least 8 characters, otherwise deleting is switched off). Five wrong passcodes in 15 minutes lock deleting; the try is written down before it is counted, so a parallel burst cannot get more than five comparisons. Deleting a class also needs the typed class name and the file count that was shown; if the class changed, nothing is deleted (409). One animal is exactly its three files, never a prefix match. Every path is checked against the same rule as the storage policy.
**Consequences:** Known costs, accepted: anyone who types five wrong guesses locks the owner out for up to 15 minutes; anyone who finds the page can see and download every class's puzzle shapes and animal names (no photos); a function deployed with Supabase's JWT check on needs the legacy `anon` key, and with the newer `sb_publishable_` keys it must be deployed with that check off (safe here: the passcode is the guard). The start-up lines that call `Deno.serve` are the one part not run by the tests; the real run in 16f covers them.

## D-053: A drawing's inner lines are cut as shallow grooves in the top face (M18a; reversed by D-058, engraving removed)

> **Reversed (2026-11-02, owner): see D-058.** Nothing below is built any more. Kept for the record of what was tried and why.

**Decision (proposed, 2026-10-30; the widths and depths below are guesses until `docs/spikes/engrave-test.stl` is printed):** Answers Q6. Marks the student drew inside the animal (eyes, nose, stripes, spots) are **engraved as flat-bottomed grooves in the top face** of each piece, in the same single STL. No second colour, no extra part.
**Why this way:** (1) _Groove_ keeps one STL, one filament and the 3 mm thickness, and nothing sticks up to catch when pieces slide together. (2) _Raised line_ is rejected: it makes the piece thicker than 3 mm, changes the stacking and the fit, and the lines catch. (3) _Thin-skin (lithophane) relief_ is rejected: it only reads in translucent filament. (4) _Two-colour inlay_ looks best but needs separate parts in a 3MF with a colour per part (A1 mini with AMS lite), which the single STL cannot carry (the Print step downloads one STL, D-047); it is kept as a **later option**: the groove polygons already make the inlay shape, so a second "ink" STL of fillers is a small addition if the owner wants it. White PLA will show a groove only as a shadow, so the colour question (Q1) is the real limit on how bold the face looks. (5) _Top face, not the bottom_: a groove in the bottom face is a void under the first layers that must be bridged, and the bottom is the face on the plate; the top is open and needs no support. The magnet pockets are in the top face too, so the grooves keep clear of them.
**How the marks are found (checked on a synthetic drawing, 800 px pad, pen 10 px):** the outline finder already has the ink mask and the filled silhouette. The interior marks are the ink that lies deeper inside the silhouette than one pen width from its edge (distance transform of the outside), traced with the same blurred marching squares and moved into millimetres with the same `fitToPlate` scale and centre as the outline. On the test drawing this gave exactly five separate loops for an outline, two eye dots, a smile, a stripe that touched the outline and a short stripe; the stripe that touched the outline stopped one pen width short of it, so it stays clear of the outline. Marks that join up with the outline cannot be told apart from it any nearer than that, which is why the edge margin exists. **Draw pad first** (pen width is known, strokes are clean); **photos next**, which need the pen width estimated from the ink (twice the median distance to the ink's edge along its skeleton; `core/image/bridge.ts` already thins ink) and the existing faint-lines control for the threshold.
**Width is the thing to watch:** the groove is as wide as the pen after the drawing has been scaled to the plate. A drawing that fills the pad gives about 2.5 mm for a 170 mm animal; a small drawing in one corner of the pad, scaled up four times, gives about 8 mm, which is not "slight". So the groove width is **normalised, not copied**: thick marks are thinned by half the excess and thin marks widened by half the shortfall (clipper offset in and out), to a target of 1.2 mm clamped between 0.8 mm (two nozzle widths) and 2.4 mm. Specks under about 1 mm squared are dropped.
**Limits to write into `core/printer/a1mini.ts` once the print confirms them (starting guesses):** groove width 1.2 mm target, 0.8 mm narrowest; depth 0.6 mm (3 layers) default, 0.4 mm (2 layers) shallowest, 1.0 mm deepest, never leaving under 1.2 mm of slab (`MIN_ENGRAVE_FLOOR_MM`, enforced in `extrudeEngraved`); at least 0.8 mm from a piece's edge (so also from every tab and cut), and at least 0.8 mm from a magnet pocket, so no sliver of top skin thinner than two lines is left. In v1 a groove does **not** run on across a cut: it stops short of the edge and starts again on the neighbour, a break of about 1.9 mm. Carrying lines across cuts is possible (open the grooves out to the edge, then fill slivers by a morphological opening) but makes the shell edges between grooves and walls meet along the cut, so it is left for later.
**Consequences:** `extrudeEngraved` (`core/mesh/engrave.ts`) is built and tested (closed shell for grooves, islands and grooves inside islands; volume exact). It does not yet know about the magnet pocket or the bottom-edge relief: those are two more copies of the same stepped-roof code in `extrudePolygon`, so M18b must **fold all three into one routine** rather than add a fourth variant. `Piece` gains `grooves`, `OutlineResult` gains the interior marks in millimetres, and the viewer, the 2D preview and the report read them. Everything is clipper integer geometry, so the same drawing and settings still give byte-identical STL. File size grows by a few thousand triangles per face (the test print, six slabs and a face, is 1,584 triangles and 79 KB), far inside the 4 MB inbox cap. Status 2026-10-31: **draw pad first, photos later** (owner). The core is built and tested: `interiorMarks` (`core/image/interior.ts`), `normaliseMarks` and `grooveRings` (`core/puzzle/engraving.ts`), `Piece.grooves`, `puzzleMeshes(puzzle, thickness, relief, engraveDepth)` and the single stepped-roof routine in `core/mesh/extrude.ts` (pocket, relief and grooves; checked identical to the old extruder). The constants are in `ENGRAVE` in `core/printer/a1mini.ts`. No screen reads the marks yet, so nothing the student sees has changed. Status 2026-10-31 (18e): **on at first** (owner), with a switch, "Engrave my drawing: On/Off", on the **Puzzle step** (not the Draw step as first planned: the pieces are seen there, and the Draw step has no room on a small laptop); it only appears for a drawing that has lines to engrave. Teacher options has the depth (Light 0.4, Normal 0.6, Deep 0.8 mm; stored as `engraveDepth`, older stored settings read as Normal) and a download of the engraving test print. The 2D preview, the 3D viewer, the print simulation and the STL all show the grooves. Until the test print has been printed the widths and depths are guesses, so the on-at-first default ships ahead of a real print (the grooves do not change the fit: they stay 0.8 mm from every edge, tab and magnet pocket).

## D-054: Photos, the camera and the sample fish are removed; the drawing pad is the only way in (M19)

**Decision (2026-10-31, owner):** There is no way to bring in a picture. Removed: Add a photo (picker, drag-drop, paste), the live camera, Straighten the picture, the sample fish button, and the tidy-up sliders (Gaps in the line, Pick up faint lines, Smooth the wobbles). The Draw step is the pad alone, open on arrival and again whenever the student comes Back, with Undo and Clear under it. Next traces what is on the pad (`traceDrawing` in `shell.ts`) and goes straight on; if no animal is found the student stays on the pad with a one-line message. This reverses the M1 photo input, the M7 camera and straightening, and the photo half of D-050 ("pad first, photo one tap away"); it supersedes D-026 and D-029 (their text is kept above as history).
**Why:** (1) Privacy: nothing a child photographs can be loaded at all, so the rule that drawings of minors never leave the browser has one fewer input to guard, and the page never asks for the camera. (2) Simplicity: one input to test and make accessible instead of four. (3) The pad's strokes are always dark on white, so lighting correction, faint-line sliders and perspective were solving problems the pad does not have.
**What was kept:** the shared `OutlineExtractor` unchanged, so a drawn animal gives the same outline, the same puzzle and the same STL as before (lighting correction is harmless on black-on-white; its tests drive it with synthetic images, and `penPx` stays optional for the same reason). Drawn outlines use the fixed `DRAWN_TIDY` setting (smoothness 100, gaps Auto), which is what the pad used by default. The sample fish outline moved to `tests/fixtures/fish.ts` and is only a test fixture; the e2e suite draws a fixed closed fish on the pad with `drawAnimal` (`e2e/helpers.ts`).
**Page behaviour:** a dropped file is ignored (`dragover` and `drop` are cancelled on the window so the tab is not replaced). A device with no finger, pen or mouse (`any-pointer: none`) is told so in the pad's hint. A keyboard-driven pad (arrow keys to move a pen, Enter to put it down) is not built; log it as M20 if the school has such devices.
**No longer planned:** the M18f "photos later" engraving item and any photo line in D-053.

## D-056: The Print step button is "Publish it now"; the STL is saved on the device only if asked (M22)

**Decision (2026-10-31, owner):** The Print step's button reads **Publish it now** (was Download puzzle file), the Print step's title reads **How it's made** (was Ready to print), and the word download is gone from what a student sees. With the class inbox, the dialog is "Publish your puzzle", its button is **Publish**, and it says only "Publish your art for your teacher to see." (it no longer repeats what is stored and the do-not-type-your-name line, at the owner's request). A box, **Also save the puzzle file** (a copy on this device), is **unticked each time the dialog opens**; the browser's save pop-up for the STL appears only when it is ticked. Without an inbox (a local build) there is nothing to publish to, so the file is always saved and the box is not shown. The notices say Publishing, Published, Not published (offline, too big) and the retry button is "Try again".
**Kept as downloads:** the Teacher options test prints ("Download a gap test") and the owner's inbox page, which really do save files.
**Consequences:** Narrows D-049 (it is the same send, now opened by Publish; what is sent and what stays on the device are unchanged). Students who do not tick the box leave with no file on the device; the owner has the STL in the inbox.

## D-055: The white, tan, gold ladder is removed from both steps (M20)

**Decision (2026-11-01, owner):** The ladder (White, Tan, Gold, with counts and a mark for the step now) is removed from the Puzzle step and from the Print step. `src/ui/ladder.ts`, its test and its styles are deleted. This reverses the ladder half of D-051 and M17; the silk gold and the no-Replay half stay.
**Why:** The numbers it showed were not useful to a student, and the row cost about 50 px of picture height on the Puzzle step.
**Kept:** the colour change on the Puzzle step still plays once (white, then tan, then gold), tan pieces keep their diagonal stripes so colour is never the only signal, and the live region says "All N pieces are gold." at the end. The Print step's to-do list already says "In Bambu Studio: white, tan, gold.", and the simulation's layer slider shows progress, so nothing replaces the "Prints" ladder.
**Consequences:** Screen-only: the STL and the puzzle are unchanged. The picture on the Puzzle step reserves 62 px (the piece count) instead of 112 px. The e2e tests that read the ladder now check that it is absent, that tan pieces are striped, that the gold line is spoken, and that the three print runs follow each other (`data-run` on the viewer canvas).

## D-057: The Print step shows its numbers as one quiet line (M21)

**Decision (2026-11-01, owner):** The four boxes (Pieces, Size, Plastic, Print time) and the "One file, printed 3 times. Estimates only." note are replaced by **one small line under the to-do list**: size, grams and time for all three prints, for example "17.0 × 10.6 cm · about 139 grams · about 3 h 45 min". The to-do list is now the first thing on the step.
**Why:** The numbers matter little to a student. A plain line (not a disclosure) keeps them visible without taking attention, and "about" on the grams and the time carries the "estimate" idea. The piece count went because the student chose it on the previous step; the per-print numbers ("up to 68 g each", "1 h 45 min each") went because only the totals help, and the to-do already says it is printed three times. "grams" is spelled out for children; "h" and "min" stay, as `formatDuration` already writes them.
**Consequences:** Screen-only: `printReport` and `report.ts` are unchanged, so the numbers and the STL are the same (the per-print numbers are still in the report for any later teacher view). The `.stats` and `.team-note` styles are gone, and so is the short-window rule that hid the note.

## D-058: Engraving the drawing's inner lines is removed; the puzzle is the outline only (M23)

**Decision (2026-11-02, owner):** The puzzle is **only the outline of the shape** cut into pieces. Lines a student draws inside the animal (eyes, nose, stripes, spots) are not found, not engraved and not shown. Removed: the "Engrave my drawing" switch on the Puzzle step, the Engraving depth option and "Download an engraving test" in Teacher options, finding the inner marks (`core/image/interior.ts`, the pen width passed to `OutlineExtractor`), the grooves in `generatePuzzle` and the pieces (`core/puzzle/engraving.ts`), the stepped-top extruder `buildSolid` (back to separate pocket and relief extruders), the engraving test print (`core/puzzle/engraveCoupon.ts`, `docs/spikes/`), and the temporary "Try an example" buttons added for testing it. Reverses D-053.
**Why:** The owner wants only the outline of the shape, not the drawing inside it. While it was being tried, a tapped dot (an eye) was dropped as a speck twice and then came out only as wide as a line, and the engraving had still not been printed on a real A1 mini.
**What was kept:** everything else. The outline, the cuts, the magnet pockets, the bottom-edge relief and the STL for a drawing are as before, and a stored Teacher options entry that still has an engraving depth is simply ignored.
**How:** done by reverting the M18 commits (and the three follow-ups made while testing them) rather than editing by hand; the history still has the working feature if it is ever wanted again.

## D-059: The Print step plays by itself, in three layers, on the whole printer, with no controls (M24)

**Decision (2026-11-04, owner):** The Print step shows **only the printer printing**. Removed: the Play / Pause / Replay button, the layer slider and its words, Slow / Normal / Fast, the Top / Angle / Printer view buttons, and the line "Fits the printer · up to 17 cm wide". The label on the picture reads **How it's made** (was Illustrative preview). The picture opens on the **Printer** view (the whole machine); it can still be turned by dragging, scrolling and the arrow keys. The preview is **three layers, not fifteen**: each layer stands for five real ones laid down at once, so it is short to watch.
**How:** `PRINT_LAYERS = 3` in `render/simulation.ts`; the preview toolpath is `PREVIEW_PATH` (layer height 1 mm). `ToolpathOptions` gains an optional `lineHeight` (default: the layer height): the nozzle lays a real layer's thickness (0.2 mm) of lines on top of what is built, and when the layer is done the solid part steps up by 1 mm, so the part is the full 3 mm at the end and nothing floats. A layer takes about 2.7 s on screen, as one did at Normal before, so a print is about 8 s (three prints with the clear-and-reprint colours, about 30 s) instead of about 2 minutes. `SPEED_SECONDS` is scaled to match; the slow and fast speeds stay in the viewer's API but nothing in the page uses them. The STL, the report and the real print are not affected.
**Why:** The controls were not needed to understand how the puzzle is made, and the picture is larger without the strip (the 3D picture now fills the card on a laptop).
**Consequences:** (1) A print that has finished cannot be replayed; going Back and then Next plays it again. (2) With **Reduce motion** nothing plays and there is no button to start it (it was **Watch it print** before): the student sees the finished puzzle on the printer. (3) `data-view` on the canvas starts as `printer`. (4) The viewer's `simPause`, `simSeekLayer`, `simSetSpeed` and `setView` stay as API (tests and any later teacher view), unused by the page. Narrows D-025 (the squashed solid and the live layer work as before) and D-038 (still the printer, still three prints).

## D-060: The animal is named only at Publish; Shuffle moves under the picture (M27)

**Decision (2026-11-05, owner):** The Puzzle step no longer has the **Animal name** field. The name is asked for in the Publish dialog (which already existed for an empty name), so the Puzzle step's side panel holds only the heading. **Shuffle** (was "Shuffle the cuts") moves to the right of the **− / number / +** piece count under the picture, as a small button with the shuffle icon and the one word. The step's heading is **Turn your drawing into a puzzle** (was "Cut it into pieces").
**Consequences:** (1) The name tag above the picture shows only after the animal has been named (at Publish), so it is hidden on the Puzzle step the first time through. (2) Tests that typed the name on the Puzzle step now name the animal in the Publish dialog (`publishAs` in `e2e/helpers.ts`). Narrows D-043 and the Layout B choice in the earlier Puzzle step decision.

## D-061: Every pair of neighbouring pieces has exactly one tab (M29)

**Decision (2026-11-05, owner):** Two pieces that touch are joined by **one** tab, never two. Before, every straight stretch of the shared border got its own tab, and a border longer than 45 mm (22 mm with Tabs: More, 70 mm with Fewer) got two, so a bendy border could show two links. Now `addTabs` takes each neighbouring pair once, puts the tab in the middle of their **longest** shared straight edge (if it is at least the minimum length), and if that does not fit (too near a thin part, would split a piece) it tries the next-longest edge, then goes without.
**Consequences:** (1) The `doubleAbove` setting is gone; the Teacher **Tabs** option (Fewer / Standard / More) now only changes the shortest border that gets a tab (16 / 12 / 6 mm). (2) Fewer tabs on a puzzle with long borders, so a little less grip between pieces: the printed fit has not been tried yet. (3) The same seed gives different cuts than before (the random choice of which piece owns the tab is made once per pair), so the golden STL in `tests/export.test.ts` was updated. Narrows the knob rules in ARCHITECTURE.md.

## D-062: The site is published from this computer, not by GitHub Actions

**Decision (2026-11-05, owner):** Deploys no longer wait on GitHub Actions, which was slow and sometimes held back by an unrelated check (the M29 push was not published because a Prettier check failed on a docs file). `npm run deploy` (`tools/deploy.mjs`) typechecks, runs the unit tests, builds with `BASE_PATH=/<repo>/` and `vite build --mode deploy`, commits the build on top of the `gh-pages` branch (fast-forward, never a force-push, with `.nojekyll`) and waits until the live page serves the new script. Pages source is "Deploy from a branch: gh-pages / root". It refuses to run unless the tree is clean and `HEAD` equals `origin/main`, so the live site is always a pushed commit.
**Consequences:** (1) The inbox address and key were Actions variables; they now live in the git-ignored `.env.deploy.local` (public by design, kept out of git). Without that file the build has no class inbox, and the script says so. (2) The workflow is renamed CI and no longer has a deploy job: it still runs lint, unit tests, a build and e2e after each push, and a red mark there no longer blocks the site, so run lint (CI uses LF line endings) before deploying. (3) GitHub still runs its own short "pages-build-deployment" step after the branch push; that is GitHub's, not ours.

## D-063: Publish it now sits in the printer box (M30)

**Decision (2026-11-06, owner):** On the Print step the **Publish it now** button leaves the footer and sits in the bottom left corner of the printer box, with the file name in a white pill under it. `renderChrome` in `src/ui/shell.ts` moves the same `#next` button (and `#next-help`) into `#publish-corner` inside `.bed` on the last step, and back into the footer on the others, so the click handler, the pulse and the ARIA link are unchanged. The "How it's made" note moves to the bottom right (top right on a phone, where the button is also smaller).
**Consequences:** (1) On the last step the footer holds only Back. (2) In the tab order the button now comes before Back on that step. (3) The pulse ripple needed the button inset from the box edge so it is not clipped.
