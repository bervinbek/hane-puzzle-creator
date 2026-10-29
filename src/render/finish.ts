import type { MeshPhysicalMaterial } from 'three';

/** How a plastic's surface looks in the 3D view. */
export interface Finish {
  metalness: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
}

/** Matte-ish plastic: white and tan. */
export const PLAIN: Finish = { metalness: 0, roughness: 0.5, clearcoat: 0, clearcoatRoughness: 0 };

/**
 * Silk gold: the metal-like sheen of gold PLA, a bit of metalness against the soft room light and a
 * clear coat on top. The scene draws on demand, so this is a still look, never a moving sparkle.
 */
export const SILK_GOLD: Finish = {
  metalness: 0.55,
  roughness: 0.32,
  clearcoat: 0.5,
  clearcoatRoughness: 0.22,
};

/** The gold filament's colour. Keep equal to the gold in `FILAMENTS` (src/ui/presets.ts); a test checks it. */
export const GOLD_HEX = '#e0a82e';

/** The finish for a CSS colour: gold is silk, every other colour is plain. */
export const finishFor = (colour: string): Finish =>
  colour.trim().toLowerCase() === GOLD_HEX ? SILK_GOLD : PLAIN;

export function applyFinish(material: MeshPhysicalMaterial, finish: Finish): void {
  material.metalness = finish.metalness;
  material.roughness = finish.roughness;
  material.clearcoat = finish.clearcoat;
  material.clearcoatRoughness = finish.clearcoatRoughness;
  material.needsUpdate = true;
}
