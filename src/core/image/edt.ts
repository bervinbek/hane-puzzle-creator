const INF = 1e9;

/** 1D squared distance transform (Felzenszwalb and Huttenlocher). */
function transform1d(
  f: Float64Array,
  n: number,
  out: Float64Array,
  v: Int32Array,
  z: Float64Array,
): void {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    while (s <= z[k]!) {
      k--;
      s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    out[q] = (q - v[k]!) ** 2 + f[v[k]!]!;
  }
}

/**
 * Exact squared Euclidean distance from every pixel to the nearest feature pixel (value 1).
 * With no feature pixels every value is about 1e9.
 */
export function squaredEdt(feature: Uint8Array, w: number, h: number): Float32Array {
  const grid = new Float32Array(w * h);
  for (let i = 0; i < grid.length; i++) grid[i] = feature[i] ? 0 : INF;

  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x]!;
    transform1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y]!;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x]!;
    transform1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x]!;
  }
  return grid;
}
