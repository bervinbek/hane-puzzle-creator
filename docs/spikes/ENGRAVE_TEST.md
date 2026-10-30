# Engraving test print (M18a)

`engrave-test.stl` is a test print for engraving a student's drawing into the top of a piece (D-053). It answers: **what is the narrowest and the shallowest groove that prints and still reads well on the A1 mini?**

It is made by `engraveCouponStl()` in `src/core/puzzle/engraveCoupon.ts`. To make it again: `WRITE_ENGRAVE_TEST=1 npx vitest run src/core/puzzle/engraveCoupon.test.ts`.

## What is on it

Six small slabs, each 3 mm thick like a real piece, in a row (about 160 mm wide, so it fits the plate).

| Slab (left to right) | Groove depth      | What it has                                                                                         |
| -------------------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| 1                    | 0.2 mm (1 layer)  | Six straight grooves                                                                                |
| 2                    | 0.4 mm (2 layers) | Six straight grooves                                                                                |
| 3                    | 0.6 mm (3 layers) | Six straight grooves                                                                                |
| 4                    | 0.8 mm (4 layers) | Six straight grooves                                                                                |
| 5                    | 1.0 mm (5 layers) | Six straight grooves                                                                                |
| 6                    | 0.6 mm            | A face: two eyes (a ring with a pupil left standing), nose, smile, two cheek marks, all 1.2 mm wide |

On slabs 1 to 5 the grooves run from the **widest at the back to the narrowest at the front**: 2.0, 1.5, 1.0, 0.8, 0.6 and 0.4 mm. Print it flat, grooves up, as it loads.

## How to print it

Use the settings you use for the puzzles: 0.2 mm layers, PLA, 0.4 mm nozzle. Print it **twice if you can, once in white and once in tan or gold**, because a groove that reads in gold can vanish in white.

## What to write down

1. Which grooves are really cut (the narrow ones may be filled in by the slicer or by the nozzle).
2. Which depths look clearly engraved, and the shallowest you would be happy to give a child.
3. Whether the face reads: the rings, the pupils, the thin smile.
4. Whether the edges of the grooves are clean, or have strings, or a rough floor.
5. White against gold: how much it matters.
6. Whether the slicer warned about anything (thin walls, gap fill).

Then say the widest, narrowest and depth you want as the default, and the numbers go into `core/printer/a1mini.ts` (D-053 lists the guesses: 1.2 mm wide, 0.8 mm narrowest, 0.6 mm deep).
