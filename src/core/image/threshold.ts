import { gaussianBlur } from './blur';

/**
 * Divides out uneven lighting (shadows, glare, gradients) so paper is about 1 everywhere and
 * ink is clearly below it. Input is 0..255 brightness; output is 0..1.
 */
export function normaliseIllumination(gray: Float32Array, w: number, h: number): Float32Array {
  const background = gaussianBlur(gray, w, h, Math.max(w, h) / 10);
  const out = new Float32Array(gray.length);
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.min(1, gray[i]! / Math.max(background[i]!, 30));
  }
  return out;
}

/** Otsu's threshold for values in 0..1: the split that best separates two brightness groups. */
export function otsu(values: Float32Array, bins = 256): number {
  const hist = new Float64Array(bins);
  for (let i = 0; i < values.length; i++) {
    const b = Math.min(bins - 1, Math.max(0, Math.floor(values[i]! * bins)));
    hist[b]!++;
  }
  const total = values.length;
  let sumAll = 0;
  for (let b = 0; b < bins; b++) sumAll += b * hist[b]!;

  let weightBg = 0;
  let sumBg = 0;
  let bestVar = -1;
  let best = bins / 2;
  for (let b = 0; b < bins; b++) {
    weightBg += hist[b]!;
    if (weightBg === 0) continue;
    const weightFg = total - weightBg;
    if (weightFg === 0) break;
    sumBg += b * hist[b]!;
    const meanBg = sumBg / weightBg;
    const meanFg = (sumAll - sumBg) / weightFg;
    const between = weightBg * weightFg * (meanBg - meanFg) ** 2;
    if (between > bestVar) {
      bestVar = between;
      best = b + 1;
    }
  }
  return best / bins;
}

/** Marks pixels darker than the threshold as ink (1). */
export function inkMask(norm: Float32Array, threshold: number): Uint8Array {
  const out = new Uint8Array(norm.length);
  for (let i = 0; i < out.length; i++) if (norm[i]! < threshold) out[i] = 1;
  return out;
}
