const SVG_NS = 'http://www.w3.org/2000/svg';

/** A little cat head, in the pad's 800 × 800 space: the outline, then two eyes and a nose. */
const STROKES: readonly { cls: string; d: string }[] = [
  {
    cls: 'outline',
    d: 'M 250 600 C 215 500 215 400 245 300 L 270 190 L 380 260 C 400 255 420 255 440 260 L 550 190 L 575 300 C 605 400 605 500 570 600 C 500 660 320 660 250 600 Z',
  },
  { cls: 'eyes', d: 'M 335 410 Q 350 385 365 410 M 455 410 Q 470 385 485 410' },
  { cls: 'nose', d: 'M 395 480 L 425 480 L 410 500 Z' },
];

/**
 * A faint example that draws itself on the empty pad, then fades (CSS does the moving, see
 * `.pad-guide` in app.css). It is its own layer above the canvas, so it is never part of the
 * strokes, Undo, or the picture the outline finder reads. Call `dismiss` on the first touch.
 */
export function createPadGuide(parent: HTMLElement): { dismiss(): void } {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'pad-guide');
  svg.setAttribute('viewBox', '0 0 800 800');
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    'A faint example of a cat drawing itself. It goes away as soon as you start to draw.',
  );
  const group = document.createElementNS(SVG_NS, 'g');
  for (const s of STROKES) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', `guide-${s.cls}`);
    path.setAttribute('d', s.d);
    path.setAttribute('pathLength', '1');
    group.append(path);
  }
  svg.append(group);
  parent.append(svg);
  return { dismiss: () => svg.remove() };
}
