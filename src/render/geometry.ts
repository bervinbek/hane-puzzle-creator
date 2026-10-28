import { BufferAttribute, BufferGeometry } from 'three';
import type { Mesh } from '../core/mesh/extrude';

/**
 * Three.js geometry for one extruded piece, with flat shading. The core mesh shares vertices
 * between the top and the walls (that is what keeps it watertight), which would blur the edges
 * when lit, so the triangles are unshared here and each gets its own normal.
 */
export function pieceGeometry(mesh: Mesh): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  flat.computeVertexNormals();
  return flat;
}
