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

## 3. Facts to verify against reference photos before modelling

These are from memory, not yet checked. Confirm each against official product photos and the wiki, then tick off.

- [ ] Open (non-enclosed) cantilever frame with the X-gantry arm supported on one side.
- [ ] Kinematics: **bed moves along Y** (bed-slinger); toolhead moves along X on the gantry; **Z raises the gantry**.
- [ ] Position of the display, spool holder, filament path and AMS lite mount.
- [ ] Colours/finishes: body plastics, rods, build plate (smooth/textured PEI), accent colours.
- [ ] Toolhead details: part-cooling fan duct, hotend cover, front camera-less shape, purge/wiper area behaviour.

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

## 6. Acceptance criteria

- Overall size matches the spec within 2 %; plate area is exactly 180 × 180 mm in scene units (1 unit = 1 mm).
- A reviewer who knows the printer recognises it at a glance.
- Moving parts never intersect the frame at any point inside the build volume.
- 60 fps on a mid-range laptop at default quality; 30 fps minimum on iPad.
- Works with the same `Puzzle` data the exporter uses (no duplicate geometry code).
