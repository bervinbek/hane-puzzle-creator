import type { Mesh } from './extrude';

const HEADER = 'Hane Puzzle Generator - millimetres, z up';

/**
 * Binary STL for one or more meshes. Little-endian, millimetres, outward-facing normals.
 * The header holds no date, so the same puzzle always produces the same bytes.
 */
export function meshesToStl(meshes: readonly Mesh[]): Uint8Array {
  const triangles = meshes.reduce((s, m) => s + m.indices.length / 3, 0);
  const bytes = new Uint8Array(84 + triangles * 50);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < HEADER.length; i++) bytes[i] = HEADER.charCodeAt(i);
  view.setUint32(80, triangles, true);

  let offset = 84;
  for (const m of meshes) {
    const p = m.positions;
    for (let t = 0; t < m.indices.length; t += 3) {
      const a = m.indices[t]! * 3;
      const b = m.indices[t + 1]! * 3;
      const c = m.indices[t + 2]! * 3;
      const ux = p[b]! - p[a]!,
        uy = p[b + 1]! - p[a + 1]!,
        uz = p[b + 2]! - p[a + 2]!;
      const vx = p[c]! - p[a]!,
        vy = p[c + 1]! - p[a + 1]!,
        vz = p[c + 2]! - p[a + 2]!;
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      for (const value of [
        nx,
        ny,
        nz,
        p[a]!,
        p[a + 1]!,
        p[a + 2]!,
        p[b]!,
        p[b + 1]!,
        p[b + 2]!,
        p[c]!,
        p[c + 1]!,
        p[c + 2]!,
      ]) {
        view.setFloat32(offset, value, true);
        offset += 4;
      }
      offset += 2; // attribute byte count, unused
    }
  }
  return bytes;
}
