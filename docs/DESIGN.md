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

Text on `--surface` and `--bg` must meet WCAG AA (4.5:1). Team colours are never the _only_ carrier of meaning (add name/shape). Dark mode is optional; the 3D scene has its own lighting either way.

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
- **Piece count:** big stepper plus presets (Easy / Medium / Tricky) with small piece glyphs.
- **Sliders:** thick tracks, large thumbs, value shown in plain words with the number beside it.
- **Team colour picker:** five swatches in a row, like the "circle your team colour" row on the slide.
- **Warnings:** inline, friendly, with a "fix it for me" button where possible.
- **Kid mode / Teacher mode toggle:** in the header; teacher mode reveals clearance, seed, tab style, units, export options.

## 6. The 3D scenes

- **Puzzle viewer:** pieces in wood tones (or the chosen team colour), soft studio lighting, subtle shadow, orbit/zoom with inertia, exploded-view slider.
- **Printer view:** realistic A1 mini on a neutral desk-like ground, soft key + fill light, environment reflection on the metal rods, shallow depth of field optional. Quality target: "product photo", within a 60 fps budget on mid-range laptops, with a Low quality toggle.
- Camera presets: Front, Over-the-shoulder, Top-down (bed), Close-up nozzle.

## 7. Accessibility

Keyboard operable stepper and sliders, visible focus ring in `--accent`, ARIA labels on canvas controls, `prefers-reduced-motion` disables auto-orbit and snap animations, colour-blind-safe pairing of team colours with names.

## 8. Voice

Encouraging and concrete. "Nice drawing! Let's tidy the lines." not "Image processed." Error copy names the cause and the fix.
