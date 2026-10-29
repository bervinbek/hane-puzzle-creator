# Design Style Guide

> Status: draft v0.1. Colours and fonts are **proposals**: the colour values were eyeballed from the rollout slide and need confirming against brand assets.

## 1. Feel

Warm, friendly, craft-like, never babyish: the same page has to work for a 5-year-old watching and a 16-year-old tinkering. Think a well-made wooden toy shop, not a CAD tool. The slide's peach/cream background, dark chocolate text and wood-grain puzzle pieces are the visual anchor.

Principles:

1. **Three steps, always visible.** Sketch, Puzzle, Print. The stepper mirrors slide points 1-2-3 (teacher awards is offline).
2. **One obvious next action** per screen. Defaults are good; advanced controls are tucked away.
3. **Show, don't explain.** The drawing visibly becomes a clean outline, then pieces, then a printing model.
4. **Forgiving.** Every slider live-previews and is undoable. Failure messages say what to do ("Close the gap in the tail, or raise _Gap closing_").
5. **Calm motion.** Playful easing on pieces snapping together; respect `prefers-reduced-motion`.

## 2. Colour (proposed tokens)

| Token                          | Value                  | Use                                  |
| ------------------------------ | ---------------------- | ------------------------------------ |
| `--bg`                         | `#EED5C2` (peach)      | Page background                      |
| `--surface`                    | `#FBF4EE` (cream)      | Cards, panels, drawing area          |
| `--ink`                        | `#5A2D12` (dark brown) | Text, outlines                       |
| `--ink-soft`                   | `#8A5A3C`              | Secondary text                       |
| `--accent`                     | `#D8261C` (team red)   | Primary buttons, focus emphasis      |
| `--team-yellow`                | `#F2B91B`              | Team colour                          |
| `--team-blue`                  | `#27B3E8`              | Team colour                          |
| `--team-tan`                   | `#E6C7AA`              | Team colour                          |
| `--team-brown`                 | `#7A3F1D`              | Team colour                          |
| `--team-red`                   | `#D8261C`              | Team colour                          |
| `--wood-light` / `--wood-dark` | `#D9A66B` / `#7A4A26`  | Default piece material in the viewer |

Text on `--surface` and `--bg` must meet WCAG AA (4.5:1). Filament colours are never the _only_ carrier of meaning (add name/shape). Dark mode is optional; the 3D scene has its own lighting either way.

## 3. Type

- **Headings:** rounded display face (proposal: Fredoka). **Body/UI:** Nunito or system UI.
- Self-host fonts (offline, no third-party CDN). Base 18 px on touch layouts; generous line height.
- Short sentences. Reading age about 8 for Kid mode strings.

## 4. Layout

- **Desktop:** left control panel (step-specific), large central canvas, right-hand info/report (collapsible).
- **Tablet/phone:** canvas on top, controls in a bottom sheet. Touch targets at least 48 px. No hover-only controls.
- Canvas always shows the bed boundary (180 mm) as a faint rounded square so users see size limits.
- Sticky primary action at the bottom: **Next** / **Download STL**.

## 5. Components

- **Stepper:** three large numbered chips with icons (pencil, puzzle piece, printer).
- **Piece count:** one stepper (− / number / +) with a slider, centred directly under the preview on the Puzzle step (D-043).
- **Sliders:** thick tracks, large thumbs, value shown in plain words with the number beside it.
- **Team colour picker:** five swatches in a row, like the "circle your team colour" row on the slide.
- **Warnings:** inline, friendly, with a "fix it for me" button where possible.
- **Kid mode / Teacher mode toggle:** in the header; teacher mode reveals clearance, seed, tab style, units, export options.

## 6. The 3D scenes

- **Puzzle viewer:** pieces in gold, soft studio lighting, subtle shadow, orbit/zoom with inertia.
- **Printer view:** realistic A1 mini on a neutral desk-like ground, soft key + fill light, environment reflection on the metal rods, shallow depth of field optional. Quality target: "product photo", within a 60 fps budget on mid-range laptops, with a Low quality toggle.
- Camera presets: Front, Over-the-shoulder, Top-down (bed), Close-up nozzle.

## 7. Accessibility

Keyboard operable stepper and sliders, visible focus ring in `--accent`, ARIA labels on canvas controls, `prefers-reduced-motion` disables auto-orbit and snap animations, colour-blind-safe pairing of filament colours with names.

## 8. Voice

Encouraging and concrete. "Nice drawing! Let's tidy the lines." not "Image processed." Error copy names the cause and the fix.

## 9. Neurodivergent-friendly rules (hard requirements)

1. **Predictable:** the stepper, Back and Next sit in the same place on every step. Nothing rearranges itself.
2. **One main action** per screen, with a plain line saying what comes next ("Step 2 of 3 · You can go back any time").
3. **Literal, short language.** No jokes, riddles or metaphors in instructions.
4. **Calm by default:** no flashing, no autoplay, no sounds, no countdowns. Animations only on user action, and off entirely with "Reduce motion" or `prefers-reduced-motion`.
5. **Legible glass:** blur and translucency are decoration only. Panels behind text are at least about 75% opaque; text meets 4.5:1 contrast (7:1 in High contrast). Backgrounds stay low-contrast and low-saturation behind panels.
6. **Reading-friendly type:** Lexend and Atkinson Hyperlegible for UI text; handwriting or decorative fonts only for a wordmark. Left-aligned, short lines, roomy spacing option.
7. **Never colour alone:** a selected option gets a tick and a bold label; team colours always carry a name.
8. **Safe to explore:** Back and Undo everywhere, nothing timed, nothing lost.
9. **Big, spaced targets** (48 px minimum), usable by touch, mouse and keyboard, with a visible focus ring.
10. **Comfort control** in the header: calm mode, reduce motion, one step at a time, text size, reading font, spacing, contrast; saved in the browser and reset with one button.
11. **Private:** say plainly that the drawing stays on the device.

## 10. Current palette and flow (supersedes the colours in section 2)

Sketchbook scheme on the Workshop glass layout (D-014): `--paper #FFFBEF` with a faint blue grid, `--ink #2B2D42`, `--ink-soft #4A4D66`, `--accent #2F5BEA` (primary button), `--note #FFF1A8` (status notes), highlighter smudges `#FFF1A8 #B8F2D0 #FFC8DD #BDE0FE`, the three filaments: gold `#E0A82E`, tan `#E6C7AA`, white `#FFFFFF`. Tokens live in `src/styles/tokens.css`.

Flow: Sketch (pick a drawing) -> Puzzle (animal name, the piece count under the preview, replay, shuffle) -> Print (what happens next). Later steps stay closed until a drawing is picked.

## 11. Screen sizes

- **Laptop and desktop** (900 px or wider, 560 px or taller): everything fits the window. No page scrolling on any step. The panel scrolls internally only as a safety net for very large text sizes.
- **Tablet and phone:** one column, page scrolls, footer buttons stay pinned. Logo and Comfort share the first row; the stepper has its own row below. The preview comes first on steps 2 and 3 so changes stay visible while adjusting.
- Touch targets are at least 44 px everywhere.

## 12. The 3D view

- The Puzzle step has no 3D: it is the flat top view with a colour animation (see below). 3D is on the Print step only, and it is always on: there is no Flat / 3D switch. The camera never turns by itself: no auto-rotate, no idle motion.
- Works with a mouse (drag to turn, scroll to zoom), touch (one finger turns, two fingers pinch) and keyboard (arrow keys turn, plus and minus zoom). "From above" and "Angled" put the camera at a known position, so nobody gets lost.
- The camera cannot go under the plate or lose the puzzle. If the browser has no WebGL, the page says so in plain words and keeps showing the flat view.

The 3D view's three presets: **Top** (plate and puzzle only), **Angle** (the plate with the printer's column behind it) and **Printer** (the whole machine). Calm mode also drops shadows and keeps the picture plainer.

## 13. Watch it print

- The Print step is always the printer: the A1 mini with the puzzle on the plate, at the angled view. Arriving on it starts the printing at once (with Reduce motion nothing starts, and the button says **Watch it print**). The strip under the picture is the print controls: Play / Pause / Replay (the word changes, not just the icon), the words "Print 2 of 3: Tan", a layer slider with its words fixed in width ("Layer 7 of 15") so nothing shifts, and Slow / Normal / Fast with a tick on the chosen one. Top / Angle / Printer stay.
- **Three prints, one file.** The head prints the whole puzzle in white, then clears the plate and prints it again in tan, then again in gold. The plate is empty at the start of each print (a real printer needs it), and the last gold set stays at the end. The colour is always named in words ("Print 2 of 3: Tan"). The layer slider works inside the print on the plate. At rest it says "3 prints: white, tan, gold". If the browser has no WebGL the page says so and shows the flat gold picture instead.
- A white **Illustrative preview** label sits on the picture: the real print is sliced in Bambu Studio.
- Dragging the slider pauses. Pausing stops all drawing (the frame counter stops). The layer text is not a live region, so screen readers are not told about every layer.
- The controls need two rows on a laptop (three in a narrow card), so the picture is shorter on this step: 62 px reserved when the card is at least 860 px wide, 112 px up to that, 160 px below 640.

## 14. Draw on screen

- The third option on step 1. Opening it puts a white pad where the picture goes, with "Draw your animal here" until the first stroke, and a small tools block in the panel: Pen (Thin, Medium, Thick, with a tick on the chosen one), Undo and Clear. Undo and Clear grey out when there is nothing to undo (and say so to assistive technology).
- While the pad is empty the Next button says why it is closed ("Draw your animal to continue"); as soon as there is a stroke it opens, and pressing it traces the drawing and goes straight to the puzzle (D-040). If no animal is found the student stays here with the message.
- Back from the puzzle shows the drawing with the blue trace line and the same three tidy controls as a photo. The option now reads "Tap to keep drawing", and tapping it brings the pad back with every stroke still there.
- The pad takes one pointer at a time, so a resting palm or a second finger does not draw. The canvas does not scroll or zoom the page while drawing.

## 15. Project dialog

- A **Project** button sits in the header next to Comfort. It opens a dialog like Comfort's: one sentence on what is saved (the shape, the pieces, the cut and the team colour; not the photo or drawing), **Save my project**, **Open a saved project**, a status line, and Done.
- Save is greyed (and says why) until there is a drawing. Opening a file that is not a project, is damaged, is too new or is too big leaves everything as it was and says so in the dialog.
- On a phone the header buttons are icons only; each keeps its name for screen readers.

## 16. Teacher options

- A **Teacher** button in the header, left of Project and Comfort. When anything is not the standard, it shows a small **on** (a word, not just a colour); where the label is hidden (a phone or a narrow laptop) a dot with the same meaning appears on the icon, and the screen reader still hears "Teacher on".
- The dialog is one column: Gap between pieces (slider with the value in mm), Tabs (Fewer, Standard, More with a tick), Biggest size (slider, cm), Cut number, File name with a live example of the name, then **Standard settings** and **Done**, which stay in view while the rest scrolls.
- Changes apply as they are made and show behind the dialog. Escape closes it and puts focus back on the Teacher button.
- Children are never asked to open it. The standard settings are the ones in every test and in the golden STL.

## 17. Picture tools and the laptop grid

- Under the picture on step 1 there is a strip of tools. With nothing chosen it holds **Use the camera** (only when the browser can). With a photo it also holds **Straighten the picture**. The strip takes 62 px from the picture on a laptop.
- **Camera:** the live picture replaces the picture area, the notice says what to do ("Hold your drawing up to the camera"), and the strip becomes **Take photo** and **Cancel**. If the camera cannot be used the notice says why in one sentence and points at Add a photo.
- **Straighten:** the photo with a shaded outside, a white line round the four corners and a ring on each corner (white with a blue edge; they also have names for screen readers: "Top left corner" and so on). Drag them, or focus one and use the arrow keys (Shift for bigger steps). **Apply**, **Reset corners**, **Cancel**. The tidy-up sliders are hidden meanwhile, so there is one thing to do at a time.
- On a laptop the two cards share one row that fills the window, so the panel and the picture keep the same size on every step.

## 18. Keyboard, touch and the checks behind them

- A **Skip to the steps** link is the first thing a keyboard user reaches; it appears at the top left only while focused.
- Everything can be reached and used with Tab, Space, Enter and the arrow keys, in reading order: header, steps, panel, picture and its controls, Back and Next. The drawing pad is the one thing that needs a pointer (the page says so and offers the photo and sample options); the corner rings for straightening also take arrow keys.
- Every control shows a 3 px outline when focused. Radio buttons and switches that are hidden under a styled box show it on the box.
- On a touch screen (a coarse pointer) every button, option, switch, slider and ring is at least 44 px, and the sliders grow to 44 px tall. Spoken names always contain the visible words (the Top button is "Top view, from above").
- The tests that guard all this are `e2e/a11y.spec.ts`, `keyboard.spec.ts`, `responsive.spec.ts` and `motion.spec.ts`. See D-030.

## 19. Works offline, and on the home screen

- After one visit the site opens with no network, 3D view included. Nothing in the page says so (nothing needs to: it just keeps working), and there is no "offline" banner to worry a child.
- On an iPad or Chromebook it can be added to the home screen as "Hane Puzzle", with the red puzzle-piece icon, and opens without browser chrome.

## 20. Teacher options, part two

- The Teacher dialog also has **Test print** (the gap test, with its instructions in words under the button) and **Bottom edge** (Off, Small, Medium, with a note that Off is how every puzzle is made and to try it with the gap test first).
- The Project dialog has a **Class batch**: add each team's puzzle, a list with a colour dot, the team's name and a Remove button for each, one Download for the lot, and Clear. It says it is kept until the tab is closed.
- The cut points cannot be moved (D-043); **Shuffle the cuts** picks another automatic cut.

## 21. The colour animation (Puzzle step)

- Coming to the Puzzle step plays it once: every piece starts white, then pieces are upgraded one at a time in a seeded random order, white to tan and then to gold, until all are gold (about 4 seconds). It stays gold. **Replay** plays it again. The same seed always gives the same order.
- Colour is never the only signal: tan pieces carry diagonal stripes, a line under the picture counts the pieces in each colour ("Gold 6 · Tan 0 · White 0"), and a screen reader hears "All 6 pieces are gold." at the end.
- Reduce motion shows the finished gold puzzle at once and hides Replay. Changing the number of pieces, or shuffling ends the animation at once and shows gold.

## 22. Magnet pockets

- Every piece has a round pocket in the top face for a 6 × 2 mm disc magnet. The Print step says "6 × 2 mm magnet in each piece (18 in all)" (pieces times three prints). The Puzzle step says in words when a piece is too small for one.
- **Magnet pocket fit** is the last slider in Teacher options, next to the gap, with a short note. The gap test print has pockets, so a teacher can try the fit with the same print.
- Nothing in the page shows polarity. That is a teacher's job.
