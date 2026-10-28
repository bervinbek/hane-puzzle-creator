import { Box3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildPrinter } from './model';
import {
  HOME_POSE,
  LAYOUT,
  LIMITS,
  OVERALL_SIZE,
  PARK_POSE,
  PLATE_SIZE_MM,
  bedOffsetY,
  clampPose,
} from './pose';

const rig = buildPrinter({ textures: false });

const boxOf = (name: string): Box3 => {
  rig.group.updateMatrixWorld(true);
  return new Box3().setFromObject(rig.parts[name]!);
};

/** How deeply two boxes overlap along their shallowest axis (0 or less when they only touch). */
function overlap(a: Box3, b: Box3): number {
  const dx = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
  const dy = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y);
  const dz = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
  return Math.min(dx, dy, dz);
}

describe('printer model size', () => {
  it('matches the published outside size within 2 %', () => {
    rig.setPose(HOME_POSE);
    const size = rig.chassisBox().getSize(new Vector3());
    expect(Math.abs(size.x - OVERALL_SIZE.x) / OVERALL_SIZE.x).toBeLessThan(0.02);
    expect(Math.abs(size.y - OVERALL_SIZE.y) / OVERALL_SIZE.y).toBeLessThan(0.02);
    expect(Math.abs(size.z - OVERALL_SIZE.z) / OVERALL_SIZE.z).toBeLessThan(0.02);
  });

  it('has a build plate that is exactly 180 x 180 mm with its top surface at z = 0', () => {
    rig.setPose(HOME_POSE);
    const pei = boxOf('pei');
    const size = pei.getSize(new Vector3());
    expect(size.x).toBeCloseTo(PLATE_SIZE_MM, 6);
    expect(size.y).toBeCloseTo(PLATE_SIZE_MM, 6);
    expect(pei.max.z).toBeCloseTo(0, 6);
    expect(rig.plate.getWorldPosition(new Vector3()).toArray()).toEqual([0, 0, 0]);
  });

  it('stays within a sensible number of triangles', () => {
    expect(rig.triangleCount()).toBeLessThan(150_000);
  });
});

describe('printer motion', () => {
  it('puts the nozzle over the plate point it was asked for, by sliding the bed the other way', () => {
    rig.setPose({ x: 40, y: -30, z: 25 });
    rig.group.updateMatrixWorld(true);
    const nozzle = rig.nozzleTip.getWorldPosition(new Vector3());
    expect(nozzle.toArray()).toEqual([40, 0, 25]);
    const plateSpot = rig.plate.localToWorld(new Vector3(40, -30, 0));
    expect(plateSpot.x).toBeCloseTo(nozzle.x, 9);
    expect(plateSpot.y).toBeCloseTo(nozzle.y, 9);
    expect(bedOffsetY(-30)).toBe(30);
  });

  it('carries whatever sits on the plate along with the bed', () => {
    rig.setPose({ x: 0, y: 50, z: 10 });
    rig.group.updateMatrixWorld(true);
    expect(rig.plate.getWorldPosition(new Vector3()).y).toBeCloseTo(-50, 9);
  });

  it('keeps every axis inside its limits', () => {
    const wild = clampPose({ x: 900, y: -900, z: -5 });
    expect(wild).toEqual({ x: LIMITS.x[1], y: LIMITS.y[0], z: LIMITS.z[0] });
    rig.setPose({ x: 900, y: 900, z: 900 });
    expect(rig.pose).toEqual({ x: 90, y: 100, z: 180 });
  });

  it('parks the toolhead raised and beside the column, clear of the puzzle', () => {
    rig.setPose(PARK_POSE);
    expect(PARK_POSE.z).toBeGreaterThanOrEqual(100);
    expect(boxOf('nozzle').min.z).toBeGreaterThanOrEqual(100);
    expect(PARK_POSE.x).toBeGreaterThan(50);
  });
});

describe('moving parts never run into the frame', () => {
  const xs = [-96, -50, 0, 50, 90];
  const ys = [-100, -50, 0, 50, 100];
  const zs = [0, 0.2, 40, 90, 180];
  const moving = ['arm', 'endBracket', 'endModule', 'head', 'sideModule', 'fanDuct'];
  const bedParts = ['carriage', 'heatbed', 'pei'];

  it('over the whole range of x, y and z', () => {
    const problems: string[] = [];
    for (const x of xs) {
      for (const y of ys) {
        for (const z of zs) {
          rig.setPose({ x, y, z });
          const where = `pose (${x}, ${y}, ${z})`;
          const boxes = Object.fromEntries(
            [
              ...moving,
              ...bedParts,
              'base',
              'frontBlock',
              'screen',
              'column',
              'carriageBlock',
              'cap',
            ].map((n) => [n, boxOf(n)]),
          );
          const against = (list: string[], other: string[]): void => {
            for (const a of list) {
              for (const b of other) {
                if (overlap(boxes[a]!, boxes[b]!) > 0.01) problems.push(`${where}: ${a} hits ${b}`);
              }
            }
          };
          against(moving, [...bedParts, 'base', 'frontBlock']);
          against(bedParts, ['frontBlock', 'screen']);
          against(['head', 'sideModule', 'fanDuct'], ['column', 'carriageBlock', 'cap']);
          against(bedParts, ['column', 'carriageBlock']);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('the nozzle only touches the plate at z = 0', () => {
    rig.setPose({ x: 0, y: 0, z: 0 });
    expect(boxOf('nozzle').min.z).toBeCloseTo(0, 9);
    rig.setPose({ x: 0, y: 0, z: 3 });
    expect(boxOf('nozzle').min.z).toBeCloseTo(3, 9);
  });

  it('the cable and toolhead stay within a hundred and fifteen millimetres of the top of the column', () => {
    for (const z of [0, 90, 180]) {
      rig.setPose({ x: -100, y: 0, z });
      rig.group.updateMatrixWorld(true);
      const top = new Box3().setFromObject(rig.group).max.z;
      expect(top).toBeLessThan(LAYOUT.cap.z[1] + 115);
    }
  });
});

describe('visibility and colour', () => {
  it('can hide everything but the bed for a clean top-down view', () => {
    rig.setMachineVisible(false);
    expect(rig.machine.visible).toBe(false);
    expect(rig.bed.visible).toBe(true);
    rig.setMachineVisible(true);
    expect(rig.machine.visible).toBe(true);
  });

  it('keeps the plate still in the view from above, however far the bed slides', () => {
    const plateAt = (): number => {
      rig.group.updateMatrixWorld(true);
      return rig.plate.getWorldPosition(new Vector3()).y;
    };
    rig.setPose({ x: 0, y: 0, z: 10 });
    rig.setMachineVisible(true);
    rig.setPose({ x: 0, y: 60, z: 10 });
    expect(plateAt()).toBeCloseTo(-60, 6);
    rig.setMachineVisible(false);
    expect(plateAt()).toBeCloseTo(0, 6);
    rig.setPose({ x: 0, y: -40, z: 10 });
    expect(plateAt()).toBeCloseTo(0, 6);
    rig.setMachineVisible(true);
    expect(plateAt()).toBeCloseTo(40, 6);
    rig.setPose(PARK_POSE);
  });

  it('has a spool wound with white filament, and white filament going into the toolhead', () => {
    const hex = (name: string): string =>
      (
        rig.parts[name] as unknown as { material: { color: { getHexString(): string } } }
      ).material.color.getHexString();
    expect(hex('spoolFilament')).toBe('f4f4f1');
    expect(hex('filament')).toBe('f4f4f1');
    expect(rig.parts.spool).toBeDefined();
  });

  it('can recolour the filament at the toolhead', () => {
    rig.setFilamentColour('#27b3e8');
    const material = (
      rig.parts.filament as unknown as { material: { color: { getHexString(): string } } }
    ).material;
    expect(material.color.getHexString()).toBe('27b3e8');
  });
});
