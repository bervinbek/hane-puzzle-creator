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

## D-026: Drawing on screen feeds the photo pipeline

**Decision:** The pad is a fixed 800 x 800 canvas of black strokes on white. Confirming the drawing (D-040) hands its pixels to the same `OutlineExtractor` a photo uses, so there is one tracing path, one set of tidy controls and one set of messages (worded for drawing: "tap Draw on screen" instead of "take the photo again"). Strokes are stored as points so Undo is exact and finished strokes are redrawn as smooth curves. The next step stays closed while the pad is open.
**Consequences:** The pad needs a pointer (finger, pen, mouse); keyboard-only and screen-reader users are told so and pointed at the photo and sample options. The drawing is never saved or uploaded, only the traced outline is used (see 7b for saving).

## D-027: A project file holds the outline, never the picture

**Decision:** A saved project is a small JSON file: app name, version, team, piece count, seed and the cleaned outline in mm (plus the sample fish's eye). No photo, no drawing, no name, no date. Opening one replaces the current shape and goes to the Puzzle step. The parser never throws; it returns one of six named problems with a plain sentence for each. Unknown extra fields are ignored so a later version can add to the file; a file from a newer version is refused with a message.
**Consequences:** Privacy holds (drawings are of minors, D-privacy in CLAUDE.md). A project saved from a traced photo cannot be re-traced, only re-cut. The save and open buttons live in one Project dialog in the header, because the step panels have no spare room on a laptop.

## D-028: Teacher options are a dialog, kept on the device, and part of the project

**Decision:** Kid mode is the default and has no extra controls. A "Teacher" button in the header (Q9: one URL, a button, as assumed) opens a dialog with the print gap, tab amount, biggest size (Q2: fit to 170 mm, can be made smaller), cut number and file name. Tab amount changes when an edge gets a tab (fewer: edges from 16 mm and a second tab only above 70 mm; standard: 12 and 45, exactly as before; more: 6 and 22). The size cap only ever scales a drawing down. The settings are saved in the browser, the header says when they are not standard, and the print gap, tabs and size cap are saved in project files so the same project always gives the same STL.
**Consequences:** The laptop layout does not grow. Opening a project replaces the teacher's own settings with the file's. The smallest gap is 0.15 mm (D-026 of the geometry: below that the validator reports pieces as too close). Q2 and Q9 are built to their defaults but still need your answer.

## D-029: Picture tools live under the picture; the camera and straightening stay on the device

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
