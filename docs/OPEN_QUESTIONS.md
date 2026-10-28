# Open Questions

Each question has the **default I will build against** until you say otherwise. Mark answered ones and move the outcome to [DECISIONS.md](DECISIONS.md).

Status key: ❓ open · ✅ answered

## Highest impact (answer these first)

| #   | Question                                                                                                                                                             | Default assumed                                                                                                                | Status |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------ |
| Q1  | **Colour.** The slide shows five team colours but the A1 mini AMS lite holds four. Is each team's puzzle one colour, or are pieces multi-coloured within one puzzle? | One colour per puzzle (filament swapped per team). Pieces stay separate STL shells; 3MF per-piece colours is a "Could" (F-21). | ❓     |
| Q2  | **Puzzle size.** Fit to the bed automatically, or does the teacher pick a size?                                                                                      | Auto-fit to 170 × 170 mm (5 mm margin each side), user can reduce, hard cap 180.                                               | ❓     |
| Q3  | **Print time budget.** One printer, a class of teams: what is the acceptable print time per puzzle?                                                                  | Show an estimate; suggest a smaller size if over 90 min (assumed).                                                             | ❓     |
| Q4  | **Input.** Photos of a whiteboard, of paper, or in-app drawing? Marker colour?                                                                                       | All three supported; assumes dark marker on light background.                                                                  | ❓     |
| Q5  | **Piece-count range per age.** What do 5-year-olds vs 16-year-olds get?                                                                                              | Easy about 6, Medium about 12, Tricky about 24; free slider 2-60.                                                              | ❓     |

## Product

| #   | Question                                                                       | Default                                                | Status |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------------ | ------ |
| Q6  | Interior details in the drawing (eyes, spots): ignore, hole, or engrave?       | Ignore (solid silhouette). Option later (F-25).        | ❓     |
| Q7  | Should pieces lock vertically too, or are in-plane jigsaw tabs enough at 3 mm? | In-plane tabs only.                                    | ❓     |
| Q8  | Do you want an optional frame/tray so the puzzle can be displayed?             | No (F-29 later).                                       | ❓     |
| Q9  | Teacher mode vs Kid mode: a toggle, or separate URLs (`/` and `/teacher`)?     | One URL, toggle in the header.                         | ❓     |
| Q10 | Languages?                                                                     | English only; strings kept in one file for later i18n. | ❓     |
| Q11 | Should there be a batch mode for a whole class's drawings?                     | Not in v1 (F-27).                                      | ❓     |

## Technical

| #   | Question                                                                          | Default                                                                   | Status |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------ |
| Q12 | Clearance: is 0.3 mm total right for your A1 mini and PLA?                        | 0.3 mm, adjustable 0.1-0.6, plus a calibration coupon (F-22).             | ❓     |
| Q13 | Stack preference: any objection to Vite + TypeScript + Three.js, no UI framework? | As stated.                                                                | ❓     |
| Q14 | Chamfer on the bottom edge to counter elephant foot?                              | Off by default, option later (F-23).                                      | ❓     |
| Q15 | How will files reach the printer: Bambu Studio on a laptop, then SD/Wi-Fi?        | Manual STL import into Bambu Studio. We add a short "how to print" panel. | ❓     |

## Deployment and ownership

| #   | Question                                                                                        | Default                                              | Status |
| --- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------ |
| Q16 | GitHub account/org and repository name?                                                         | `hane-puzzle-generator` under your personal account. | ✅     |
| Q17 | Custom domain, or the default `github.io` URL?                                                  | Default `github.io`.                                 | ✅     |
| Q18 | Public or private repo? (GitHub Pages on a private repo needs a paid plan.)                     | Public.                                              | ✅     |
| Q19 | Is the project name "Hane" tied to a brand or to the Hane Board product? Any logo/brand assets? | Plain text wordmark; colours from the slide.         | ❓     |
| Q20 | Is the sample drawing set available for tests (with consent, anonymised)?                       | Synthetic and self-drawn fixtures.                   | ❓     |
