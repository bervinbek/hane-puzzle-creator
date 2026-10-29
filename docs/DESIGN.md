# Design Style Guide

> Status: draft v0.1. Colours and fonts are **proposals**: the colour values were eyeballed from the rollout slide and need confirming against brand assets.

## 1. Feel

Warm, friendly, craft-like, never babyish: the same page has to work for a 5-year-old watching and a 16-year-old tinkering. Think a well-made wooden toy shop, not a CAD tool. The slide's peach/cream background, dark chocolate text and wood-grain puzzle pieces are the visual anchor.

Principles:

1. **Three steps, always visible.** Sketch, Puzzle, Print. The stepper mirrors slide points 1-2-3 (teacher awards is offline).
2. **One obvious next action** per screen. Defaults are good; advanced controls are tucked away.
3. **Show, don't explain.** The drawing visibly becomes a clean outline, then pieces, then a printing model.
4. **Forgiving.** Every slider live-previews and is undoable. Failure messages say what to do (a gap in the line is not one of them: the app closes it, D-048).
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

- The third option on step 1. Opening it puts a white pad where the picture goes, with "Draw your animal here" until the first stroke, and a small tools block in the panel: Undo and Clear (one pen size, D-050). Undo and Clear grey out when there is nothing to undo (and say so to assistive technology).
- While the pad is empty the Next button says why it is closed ("Draw your animal to continue"); as soon as there is a stroke it opens, and pressing it traces the drawing and goes straight to the puzzle (D-040). If no animal is found the student stays here with the message.
- Back from the puzzle shows the drawing with the blue trace line and the same three tidy controls as a photo. The option now reads "Tap to keep drawing", and tapping it brings the pad back with every stroke still there.
- The pad takes one pointer at a time, so a resting palm or a second finger does not draw. The canvas does not scroll or zoom the page while drawing.

## 15. Project dialog (removed)

The Project button and dialog, saved project files and the class batch were removed in M13 (D-046). Nothing a child draws is saved; the one thing that leaves the page is the STL, named after the animal.

## 16. Teacher options

- A **Teacher** button in the header, left of Comfort. When anything is not the standard, it shows a small **on** (a word, not just a colour); where the label is hidden (a phone or a narrow laptop) a dot with the same meaning appears on the icon, and the screen reader still hears "Teacher on".
- The dialog is one column: Gap between pieces (slider with the value in mm), Tabs (Fewer, Standard, More with a tick), Biggest size (slider, cm), Cut number, Test print, then **Standard settings** and **Done**, which stay in view while the rest scrolls.
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
- The cut points cannot be moved (D-043); **Shuffle the cuts** picks another automatic cut.

## 21. The colour animation (Puzzle step)

- Coming to the Puzzle step plays it once: every piece starts white, then pieces are upgraded one at a time in a seeded random order, white to tan and then to gold, until all are gold (about 4 seconds). It stays gold. There is no Replay button (D-051); going back to the step and forward again plays it once more. The same seed always gives the same order.
- Colour is never the only signal: tan pieces carry diagonal stripes, the white, tan, gold ladder under the picture counts the pieces in each colour (section 26), and a screen reader hears "All 6 pieces are gold." at the end.
- Reduce motion shows the finished gold puzzle at once. Changing the number of pieces, or shuffling ends the animation at once and shows gold.

## 22. Magnet pockets

- Every piece has a round pocket in the top face for a 6 × 2 mm disc magnet. The Print step says "6 × 2 mm magnet in each piece (18 in all)" (pieces times three prints). The Puzzle step says in words when a piece is too small for one.
- **Magnet pocket fit** is the last slider in Teacher options, next to the gap, with a short note. The gap test print has pockets, so a teacher can try the fit with the same print.
- Nothing in the page shows polarity. That is a teacher's job.

## 23. The Puzzle step layout (D-044)

- **Under the picture:** only the piece count (the one obvious action): "How many pieces?", − / number / +, and the slider, centred. On laptops the picture is sized to leave room for it, so the page never scrolls (the fit test and a card-overflow check enforce this at every laptop size, tablets and phones).
- **Inside the picture:** the colour count line (Gold, Tan, White with numbers), the word form of the three colours.
- **Side panel:** the kicker "Step 2 of 3 · Choose the pieces", the heading, **Animal name**, then **Shuffle the cuts** as two full-width buttons (they wrap on a narrow panel), then the notice for warnings. Replay is hidden with Reduce motion, and toggling the setting takes it away or brings it back at once.
- **No hint line:** the slider and the picture already say what the step does (the copy rule). Phones and tablets show the picture and the piece count first, then the panel.
- Two layouts were compared: A (count, Replay and Shuffle all under the picture) and B (only the count under the picture); B was chosen. It gives the picture about 60 px more height and leaves one thing to do under it.

## 24. Naming the file (D-047)

- The **Animal name** box on the Puzzle step is the file name. Its example is "Fish" (no "optional").
- The Print step shows the file name ("Elephant.stl") next to the **Download puzzle file** button, as the only words there. It is hidden on a phone, where the button needs the room.
- **Download** with no usable name opens a small dialog in the middle of the screen (the same glass look as Comfort and Teacher options): the heading "Name your animal", a labelled box (focus starts in it), the file name it makes, the short message "Use some letters or numbers." when the text cannot be a name, **Cancel** and **Save**. Save is closed (`aria-disabled`, dimmed) until the name is usable; Enter saves and Escape cancels, and focus goes back to Download. The words are kept to the least that works (copy rule).
- Spelling is kept as typed, in any language; reserved Windows names get " puzzle" added.

## 25. Open lines (D-048)

- A line with a gap is closed by the app, for a photo and for the drawing pad alike. The notice reads "Found your animal! I closed a gap in the line. Press Next if the blue line looks right." and the blue line shows where it closed.
- No message ever asks the student to join the line up, draw over the gap, or change Gaps. Gaps: Auto / Small / Big stay in the three controls and all of them close an open line.
- Only a drawing with no loop at all (separate scribbles) gets a message, and it is the plain "I can't see a drawing" one.

## 26. Gold, and the white, tan, gold ladder (D-051)

- **Gold is called "Gold"**, never "glossy". The shine comes from the picture itself.
- **Gold in the flat pictures (Puzzle step):** a linear gradient across each piece, corner to corner: `#ffe9a6` at 0, `#f0bf45` at 30%, `#e0a82e` at 55% (the filament colour), `#b87a10` at 82%, `#f1c658` at 100%. A soft rim light (`#fff4c4`, 60% opacity, clipped to the inside of the piece) sits just inside the edge, and the dark outline is drawn on top so the pieces stay clear. The hue is the filament's own `#e0a82e`; it was not matched to a photo of the real spool (none was available), so check it against the real filament and adjust the stops.
- **Glints:** one four-point star per gold piece, at a seeded spot inside the piece (`glintSpot`), swelling and fading over 3 to 4.6 seconds with its own start time. Never a flash; the whole screen never gets more than about five glints a second, each small. White and tan pieces have none, so a glint comes in as a piece reaches gold. Glints are decoration and are hidden from screen readers. With Reduce motion they stay, still. Cost: a handful of small CSS animations on transform and opacity, no per-frame redraw.
- **Gold in the 3D scene (Print step):** a physical material, metalness 0.55, roughness 0.32, clear coat 0.5, lit by the existing soft room light (`render/finish.ts`). It is a still look; the scene still draws only on demand, with no sparkle loop. White and tan stay plain.
- **The ladder:** an ordered list of three steps, left to right White, Tan, Gold, with a chevron between them. Each step has its name, a swatch with the same texture as the pieces (plain white, tan with stripes, silk gold), a number, and a mark: a tick when done, a pointer when it is the step now. The step now also has a thick border and a pale yellow fill, and is `aria-current="step"`. A screen reader hears "step 1 of 3, done" and so on.
  - **Puzzle step:** its own row under the picture ("Pieces"). The number is how many pieces are at that colour. The step now is the colour the last changed piece went to; a colour is done when every piece has moved past it. At the end White and Tan are done and Gold is now. With Reduce motion it shows that end state at once.
  - **Print step:** the same ladder ("Prints") over the printer, bottom centre. The number is the print number, and the print running is the step now. Before the printing starts nothing is marked.
  - The caption is hidden on phones, and the ladder wraps there. Laptop windows keep fitting without scrolling (the picture gives up about 50 px on the Puzzle step).

