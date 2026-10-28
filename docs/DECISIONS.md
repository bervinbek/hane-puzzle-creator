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
