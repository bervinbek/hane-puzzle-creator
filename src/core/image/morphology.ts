/** Pixels reachable from the image border without crossing a blocked pixel (4-connected). */
export function floodExterior(blocked: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let top = 0;
  const push = (i: number): void => {
    if (!blocked[i] && !out[i]) {
      out[i] = 1;
      stack[top++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (top > 0) {
    const i = stack[--top]!;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  return out;
}

export interface Components {
  /** 0 for background, otherwise 1-based component number. */
  labels: Int32Array;
  /** areas[k] is the pixel count of component k; areas[0] is unused. */
  areas: number[];
}

/** Connected components of the non-zero pixels (4-connected). */
export function labelComponents(mask: Uint8Array, w: number, h: number): Components {
  const labels = new Int32Array(w * h);
  const areas: number[] = [0];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    const id = areas.length;
    let count = 0;
    let top = 0;
    labels[start] = id;
    stack[top++] = start;
    while (top > 0) {
      const i = stack[--top]!;
      count++;
      const x = i % w;
      const y = (i - x) / w;
      const visit = (j: number): void => {
        if (mask[j] && !labels[j]) {
          labels[j] = id;
          stack[top++] = j;
        }
      };
      if (x > 0) visit(i - 1);
      if (x < w - 1) visit(i + 1);
      if (y > 0) visit(i - w);
      if (y < h - 1) visit(i + w);
    }
    areas.push(count);
  }
  return { labels, areas };
}

/** Area of the biggest connected component (0 for an empty mask). */
export function largestArea(areas: readonly number[]): number {
  let best = 0;
  for (let k = 1; k < areas.length; k++) best = Math.max(best, areas[k]!);
  return best;
}

/** Keeps only the biggest connected component. */
export function keepLargest(mask: Uint8Array, w: number, h: number): Uint8Array {
  const { labels, areas } = labelComponents(mask, w, h);
  let bestId = 0;
  for (let k = 1; k < areas.length; k++) if (areas[k]! > (areas[bestId] ?? 0)) bestId = k;
  const out = new Uint8Array(mask.length);
  if (bestId === 0) return out;
  for (let i = 0; i < out.length; i++) if (labels[i] === bestId) out[i] = 1;
  return out;
}

/** Drops connected components smaller than `minArea` pixels (stray specks). */
export function removeSmall(mask: Uint8Array, w: number, h: number, minArea: number): Uint8Array {
  const { labels, areas } = labelComponents(mask, w, h);
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < out.length; i++) {
    const id = labels[i]!;
    if (id > 0 && areas[id]! >= minArea) out[i] = 1;
  }
  return out;
}
