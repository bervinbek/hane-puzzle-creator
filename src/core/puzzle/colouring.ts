/**
 * Greedy colouring so neighbouring pieces get different colours.
 * `neighbours[i]` lists the pieces touching piece i. Returns a palette index per piece.
 * Planar maps rarely need more than 5 colours; if the palette runs out it wraps around.
 */
export function greedyColouring(
  neighbours: readonly (readonly number[])[],
  paletteSize: number,
): number[] {
  const colours: number[] = new Array<number>(neighbours.length).fill(-1);
  neighbours.forEach((adjacent, i) => {
    const used = new Set<number>();
    for (const n of adjacent) {
      const c = colours[n];
      if (c !== undefined && c >= 0) used.add(c);
    }
    let pick = 0;
    while (pick < paletteSize && used.has(pick)) pick++;
    colours[i] = pick < paletteSize ? pick : i % paletteSize;
  });
  return colours;
}
