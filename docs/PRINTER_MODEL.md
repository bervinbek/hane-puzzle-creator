# Task Spec: Realistic Bambu Lab A1 mini Model

> Dedicated milestone **M5**. Can run in parallel with the puzzle-geometry milestones (M1-M3) because it only needs the printer constants and a defined plate coordinate system.

## 1. Goal

A convincing, real-time Three.js model of the Bambu Lab A1 mini that the print simulation (F-10) runs on: the bed slides, the toolhead travels, the gantry rises, and the puzzle pieces appear on the plate at true scale.

## 2. Verified specs (from the official store and reviews)

| Item              | Value                                           | Source                                                                                                                                                   |
| ----------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build volume      | 180 × 180 × 180 mm                              | [Bambu Lab store](https://eu.store.bambulab.com/en-bg/products/a1-mini), [Tom's Hardware review](https://www.tomshardware.com/reviews/bambu-lab-a1-mini) |
| Machine footprint | about 347 × 315 × 365 mm, 5.5 kg                | Bambu Lab store listing                                                                                                                                  |
| Stock nozzle      | 0.4 mm stainless steel (0.2/0.6/0.8 optional)   | Bambu Lab store                                                                                                                                          |
| Max hotend temp   | 300 °C                                          | Bambu Lab store                                                                                                                                          |
| Multi-colour      | AMS lite, up to 4 colours, one unit per A1 mini | Bambu Lab store                                                                                                                                          |

## 3. Facts checked against the references

Checked on 2026-10-29 against the official product photos (a front three-quarter view and the AMS lite combo view) and retailer and review text. Unchecked or uncertain items are marked.

- [x] **Open cantilever frame with one vertical support.** One tall column at the right, with the X arm sticking out to the left from its side. Confirmed by photo and by a review calling it a cantilever-gantry printer with one vertical support.
- [x] **Kinematics:** the bed slides front to back (Y); the toolhead moves left to right (X) along the arm; the arm rides up and down the column (Z). Confirmed by reviews and photo.
- [x] **Colours and finish:** silver anodised aluminium column and arm, light grey plastic base, column cap and toolhead body, dark grey end bracket, black bed with a speckled textured sheet, black glossy touch screen on the front of the base, three small black ports and a vent grille on the front right, a brass nozzle and brass ring on the toolhead front. Not black, as I first assumed.
- [x] **Spool holder:** attaches to the Z column (retailer listings). Modelled as a bracket from the back of the column cap with a spool on an axle behind the machine; treated as an accessory. **Uncertain:** the exact bracket shape.
- [x] **Cable:** a black cable arcs from the top of the toolhead over to the column cap. Confirmed by photo.
- [x] **Screen:** 2.4 inch 320 × 240 touch screen (quick start manual), on the front of the base, slightly right of centre. Shown with soft coloured tiles and no text or logo.
- [x] **AMS lite:** a separate stand beside the printer; not modelled (we print one colour).
- [ ] **Uncertain:** the real toolhead's fan-duct shape and the dark module at the arm's left end are simplified blocks. The real wiper and purge area are not modelled.

Sources: the [Bambu Lab A1 mini product page](https://uk.store.bambulab.com/collections/a1-series/products/a1-mini) photos (reference only; nothing is copied), a [3DPros review](https://3dpros.com/printer-content/bambu-lab-a1-mini-review), the [3Dnatives article](https://www.3dnatives.com/en/bambu-lab-a1-220920234/) and the [A1 mini quick start manual](https://www.manualslib.com/manual/3236250/Bambu-Lab-A1-Mini.html).

### Measurements sheet (millimetres)

Origin: the middle of the plate's top surface with the bed centred. x right, y back, z up. These are the numbers in `src/render/printer/pose.ts`; the model and its tests share them.

| Part                            | x               | y           | z             |
| ------------------------------- | --------------- | ----------- | ------------- |
| Base                            | -125 to 196     | -185 to 130 | -85 to -30    |
| Feet                            | at the corners  |             | -88 to -85    |
| Bed carriage                    | -75 to 75       | -75 to 75   | -30 to -14    |
| Heated bed                      | -90 to 90       | -90 to 90   | -11.5 to -1.5 |
| Textured sheet (top is z = 0)   | -90 to 90       | -90 to 90   | -1.5 to 0     |
| Column                          | 150 to 190      | 30 to 82    | -30 to 259    |
| Column cap                      | 147 to 193      | 26 to 86    | 259 to 277    |
| Arm (relative to nozzle height) | -140 to 150     | 30 to 56    | 26 to 54      |
| Toolhead body                   | toolhead x ± 25 | -18 to 28   | 16 to 72      |
| Nozzle tip                      | toolhead x      | 0           | 0             |

Overall size at the home pose: 347 × 316 × 365 mm against the published 347 × 315 × 365.

## 4. Approach

Build an **original** model from primitives (rounded boxes, cylinders, extrusions) with PBR materials, driven by real dimensions. No copied CAD, no Bambu logo or wordmark (trademark), no scraped meshes. A hand-authored `.glb` can replace it later if quality demands it, but the procedural rig must stay as the source of truth for the moving parts.

**Rig hierarchy (so animation is trivial):**

```
printerRoot
 ├─ base (static)
 │   └─ bedCarriage  ← translates along Y
 │       └─ buildPlate (180 × 180 plate surface; puzzle parent sits here)
 ├─ zColumn (static)
 │   └─ gantry       ← translates along Z
 │       └─ toolheadCarriage ← translates along X
 │           └─ nozzleTip (world position = deposition point)
 └─ spoolHolder / (optional) AMS lite
```

Puzzle meshes are parented to `buildPlate` so they ride with the bed. The nozzle's position relative to the plate comes from the sim path; the rig solves it as: toolhead X = path x, bed Y = −path y (sign checked against the real machine), gantry Z = path z.

## 5. Work breakdown

1. Gather reference photos/dimensions; write a measurements sheet in this file.
2. Block out at true scale; verify overall 347 × 315 × 365 and the 180³ build volume against the model.
3. Detail pass: rails and rods, belts, toolhead, fan duct, nozzle, cable chain, screen, spool holder, feet.
4. Materials: dark plastics (subtle roughness variation), brushed/anodised metal, textured PEI plate (procedural normal map), glossy screen with a simple UI texture.
5. Rig and animation: bed Y, toolhead X, gantry Z, with limits that match the build volume.
6. Lighting and environment: studio HDRI (self-hosted), contact shadows, optional bloom/DoF off by default.
7. Filament visual: a thin glowing/extruding bead at the nozzle and a spool that rotates as material is consumed.
8. Performance pass: merge static geometry, instancing for repeated parts, under about 150k triangles, total assets under about 5 MB, a Low quality toggle.
9. Review checklist: side-by-side with reference photos, check the scale against a 3 mm puzzle on the plate.

## 6. Acceptance criteria and status

- [x] Overall size matches the spec within 2 % (tested: 347 × 316 × 365). The plate is exactly 180 × 180 mm in scene units (1 unit = 1 mm), with its top at z = 0 (tested).
- [ ] A reviewer who knows the printer recognises it at a glance. **Needs you:** compare the "Printer" view with the real machine and say what looks wrong.
- [x] Moving parts never intersect the frame at any point inside the build volume (tested on a 6 × 5 × 5 grid of poses with box checks, including the park pose).
- [ ] 60 fps on a mid-range laptop at default quality; 30 fps minimum on iPad. The model is about 8,000 triangles; shadows use a 2048 map, which Calm mode turns off. **Not measured on real hardware yet.**
- [x] Works with the same `Puzzle` data the exporter uses: the viewer builds each piece from the exporter's meshes and parents them to the plate, so they ride with the bed.

## 7. What is not done yet

Rails, belts and wiring under the covers; the real toolhead's exact shapes; a spool that turns as plastic is used; a glowing bead at the nozzle. Those belong with the print simulation (M6) or later polish.
