const SVG_NS = 'http://www.w3.org/2000/svg';

/** One animal's turn on the pad, in ms. Keep in step with `7s` in the `.guide-*` rules in app.css. */
const CYCLE_MS = 7000;
/** How long the line takes to go round: one third of a turn, 50% quicker than the old 3.5 s. */
const DRAW_MS = CYCLE_MS / 3;
/** Where the brush is sampled along the outline. */
const BRUSH_STEPS = 72;
const START_DELAY_MS = 600;

/** The outlines only (no eyes or nose), in the pad's 800 × 800 space. Each is one closed line. */
const ANIMALS: readonly { name: string; d: string }[] = [
  {
    name: 'cat',
    d: 'M 245 150 L 297 215 C 330 203 360 203 393 215 L 445 150 L 457 255 C 475 295 471 335 447 360 C 505 410 540 490 535 570 C 595 590 635 560 640 500 C 642 470 678 468 678 505 C 680 585 635 640 570 640 L 160 640 L 155 570 C 150 490 185 410 243 360 C 219 335 215 295 233 255 Z',
  },
  {
    name: 'elephant',
    d: 'M 285 245 C 335 195 425 200 475 228 C 545 195 630 225 655 300 C 672 350 672 430 662 500 C 662 550 660 600 656 640 L 572 640 C 572 600 574 565 570 540 C 520 565 450 565 410 540 C 410 580 414 610 412 640 L 322 640 C 320 600 322 565 318 530 C 295 515 280 500 275 480 C 275 530 272 575 262 600 C 258 625 235 645 210 640 C 190 635 180 615 190 600 C 196 590 205 590 210 580 C 212 540 195 490 192 430 C 190 370 215 320 232 290 C 242 268 258 255 285 245 Z',
  },
  {
    name: 'dragon',
    d: 'M 130 272 L 165 240 L 215 232 L 222 185 L 250 225 L 268 222 L 292 170 L 302 235 C 330 255 355 300 385 345 C 400 250 430 170 480 110 Q 495 190 520 230 Q 545 160 590 150 Q 585 215 600 255 Q 640 225 680 235 Q 660 300 610 380 C 690 380 760 400 762 470 L 775 472 L 742 530 L 709 472 L 722 470 C 720 435 690 425 640 430 C 645 500 655 570 645 620 L 565 620 C 565 590 568 560 558 530 C 505 550 445 550 415 535 C 417 570 425 600 425 620 L 345 620 C 347 580 345 540 340 510 C 320 460 295 400 275 345 C 255 322 240 305 215 305 L 165 290 Z',
  },
];

/** A small paintbrush, tip at the origin and the handle leaning up and to the right. */
function createBrush(): SVGGElement {
  const outer = document.createElementNS(SVG_NS, 'g');
  outer.setAttribute('class', 'guide-brush');
  const art = document.createElementNS(SVG_NS, 'g');
  art.setAttribute('transform', 'rotate(40) scale(0.8)');
  const parts: readonly [string, string][] = [
    ['brush-handle', 'M -7 -42 L 7 -42 L 4.5 -112 Q 0 -118 -4.5 -112 Z'],
    ['brush-ferrule', 'M -9 -42 L 9 -42 L 9 -28 L -9 -28 Z'],
    ['brush-bristles', 'M -9 -28 L 9 -28 C 9 -14 4 -5 0 0 C -4 -5 -9 -14 -9 -28 Z'],
  ];
  for (const [cls, d] of parts) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', cls);
    path.setAttribute('d', d);
    art.append(path);
  }
  outer.append(art);
  return outer;
}

/**
 * The brush follows each line as it is drawn, then lifts away. One animation walks it round all
 * the outlines in turn, so it always moves in step with the line (both are linear in time). With
 * Reduce motion it never starts, and it stops if the switch is turned on while it plays. Returns
 * the function that ends the watching.
 */
function animateBrush(brush: SVGGElement, outlines: readonly SVGPathElement[]): () => void {
  const root = document.documentElement;
  const still = (): boolean => root.dataset.reduceMotion === 'true';
  const none = (): void => {};
  if (still() || typeof brush.animate !== 'function') return none;
  if (outlines.some((o) => typeof o.getTotalLength !== 'function')) return none;
  const total = outlines.length * CYCLE_MS;
  const draw = DRAW_MS / total;
  const hidden = 1e-4;
  const frames: Keyframe[] = [];
  outlines.forEach((outline, i) => {
    const length = outline.getTotalLength();
    const at = (t: number, dx = 0, dy = 0) => {
      const p = outline.getPointAtLength(length * t);
      return `translate(${(p.x + dx).toFixed(1)}px, ${(p.y + dy).toFixed(1)}px)`;
    };
    const start = (i * CYCLE_MS) / total;
    if (i > 0) frames.push({ offset: start - hidden, transform: at(0), opacity: 0 });
    for (let s = 0; s <= BRUSH_STEPS; s++) {
      frames.push({
        offset: start + (draw * s) / BRUSH_STEPS,
        transform: at(s / BRUSH_STEPS),
        opacity: 1,
      });
    }
    frames.push({ offset: start + draw + 0.02, transform: at(1, 40, -40), opacity: 0 });
  });
  frames[frames.length - 1]!.offset = Math.min(frames[frames.length - 1]!.offset as number, 1);
  const run = brush.animate(frames, {
    duration: total,
    delay: START_DELAY_MS,
    fill: 'both',
    easing: 'linear',
  });
  const watch = new MutationObserver(() => {
    if (still()) run.cancel();
  });
  watch.observe(root, { attributes: true, attributeFilter: ['data-reduce-motion'] });
  return () => watch.disconnect();
}

/**
 * A faint example that draws itself on the empty pad, one animal after another (a cat, an
 * elephant, a dragon), with a small paintbrush following the line. Then it fades (CSS does the
 * line, see `.pad-guide` in app.css; the brush is moved by `animateBrush`). It is its own layer
 * above the canvas, so it is never part of the strokes, Undo, or the picture the outline finder
 * reads. Call `dismiss` on the first touch.
 */
export function createPadGuide(parent: HTMLElement): { dismiss(): void } {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'pad-guide');
  svg.setAttribute('viewBox', '0 0 800 800');
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    'A faint example of a cat, then an elephant, then a dragon, each drawn as an outline by a small paintbrush. It goes away as soon as you start to draw.',
  );
  const outlines: SVGPathElement[] = [];
  ANIMALS.forEach((animal, i) => {
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'guide-animal');
    group.style.setProperty('--i', String(i));
    group.dataset.animal = animal.name;
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'guide-outline');
    path.setAttribute('d', animal.d);
    path.setAttribute('pathLength', '1');
    group.append(path);
    svg.append(group);
    outlines.push(path);
  });
  const brush = createBrush();
  svg.append(brush);
  parent.append(svg);
  const stop = animateBrush(brush, outlines);
  return {
    dismiss: () => {
      stop();
      svg.remove();
    },
  };
}
