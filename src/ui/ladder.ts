import type { Tone } from '../core/puzzle/reveal';
import { TONE_NAME } from './puzzlePreview';

/** Where a colour is in the climb from white to tan to gold. */
export type RungState = 'done' | 'current' | 'todo';

export interface Rung {
  /** Which colour this step is: 0 white, 1 tan, 2 gold. */
  tone: Tone;
  /** The number shown on the step (pieces on the Puzzle step, the print number on the Print step). */
  value: number;
  state: RungState;
}

/** The words a screen reader hears after each step's number. */
export interface LadderWords {
  /** Shown before the steps: "Pieces" or "Prints". */
  caption: string;
  /** Said after each number, for example "pieces" or "print number". Not shown. */
  unit: string;
}

const MARK: Record<RungState, string> = { done: '✓', current: '▸', todo: '' };
const SPOKEN: Record<RungState, string> = { done: 'done', current: 'now', todo: 'to come' };

/**
 * The white, tan, gold ladder: three steps left to right with a chevron between them. It is drawn
 * the same way on the Puzzle step (how many pieces are at each colour) and on the Print step (which
 * of the three prints is running). Colour is never the only signal: each step has its name, a
 * number, the same texture as the pieces (see `.swatch` in app.css) and a mark for done or now.
 */
export function ladderHtml(rungs: readonly Rung[], words: LadderWords): string {
  const items = rungs
    .map((r, i) => {
      const name = TONE_NAME[r.tone]!;
      return (
        `<li class="rung" data-tone="${name.toLowerCase()}" data-state="${r.state}"` +
        `${r.state === 'current' ? ' aria-current="step"' : ''}>` +
        `<span class="swatch" aria-hidden="true"></span>` +
        `<span class="rung-name">${name}</span>` +
        `<span class="rung-value">${r.value}<span class="visually-hidden"> ${words.unit}, step ${i + 1} of ${rungs.length}, ${SPOKEN[r.state]}</span></span>` +
        `<span class="rung-mark" aria-hidden="true">${MARK[r.state]}</span>` +
        `</li>`
      );
    })
    .join('');
  return `<span class="ladder-caption" aria-hidden="true">${words.caption}</span><ol class="ladder" aria-label="${words.caption}, from white to tan to gold">${items}</ol>`;
}

/**
 * The Puzzle step's steps from how many pieces are at each colour. `active` is the colour of the
 * piece that changed last (white before anything has changed, gold at the end). A colour is done
 * once every piece has moved past it, so a step never goes back from done.
 */
export function pieceRungs(tones: readonly Tone[], active: Tone): Rung[] {
  const counts = [0, 0, 0];
  for (const t of tones) counts[t]!++;
  const lowest = tones.length === 0 ? 0 : Math.min(...tones);
  return ([0, 1, 2] as const).map((tone) => ({
    tone,
    value: counts[tone]!,
    state: tone === active ? 'current' : tone < lowest ? 'done' : 'todo',
  }));
}

/**
 * The Print step's steps from the print that is running (1 to 3; 0 when none has started). The
 * earlier prints are done, the running one is "now", and the finished last print stays "now".
 */
export function printRungs(run: number): Rung[] {
  return ([0, 1, 2] as const).map((tone) => ({
    tone,
    value: tone + 1,
    state: tone + 1 === run ? 'current' : tone + 1 < run ? 'done' : 'todo',
  }));
}
