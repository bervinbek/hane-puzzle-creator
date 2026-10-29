import { describe, expect, it } from 'vitest';
import type { Tone } from '../core/puzzle/reveal';
import { ladderHtml, pieceRungs, printRungs } from './ladder';

const states = (r: { state: string }[]): string[] => r.map((x) => x.state);

describe('pieceRungs', () => {
  it('counts the pieces at each colour and marks white as now before anything changes', () => {
    const r = pieceRungs([0, 0, 0, 0], 0);
    expect(r.map((x) => x.value)).toEqual([4, 0, 0]);
    expect(states(r)).toEqual(['current', 'todo', 'todo']);
  });

  it('marks the colour of the piece that changed last, and a colour is done only when all have passed it', () => {
    const tones: Tone[] = [2, 1, 0, 0];
    expect(states(pieceRungs(tones, 1))).toEqual(['todo', 'current', 'todo']);
    expect(states(pieceRungs([2, 1, 1, 2], 2))).toEqual(['done', 'todo', 'current']);
  });

  it('ends with white and tan done and gold now', () => {
    const r = pieceRungs([2, 2, 2], 2);
    expect(r.map((x) => x.value)).toEqual([0, 0, 3]);
    expect(states(r)).toEqual(['done', 'done', 'current']);
  });
});

describe('printRungs', () => {
  it('has nothing running before the first print', () => {
    expect(states(printRungs(0))).toEqual(['todo', 'todo', 'todo']);
  });

  it('marks the running print, the finished ones and the ones to come', () => {
    expect(states(printRungs(2))).toEqual(['done', 'current', 'todo']);
    expect(states(printRungs(3))).toEqual(['done', 'done', 'current']);
  });
});

describe('ladderHtml', () => {
  const html = ladderHtml(pieceRungs([2, 1, 0], 1), { caption: 'Pieces', unit: 'pieces' });

  it('is an ordered list of three steps, white then tan then gold', () => {
    expect(html).toContain('<ol class="ladder"');
    expect([...html.matchAll(/data-tone="(\w+)"/g)].map((m) => m[1])).toEqual([
      'white',
      'tan',
      'gold',
    ]);
  });

  it('says the step and the state in words, and marks only one step as current', () => {
    expect(html).toContain('step 2 of 3, now');
    expect(html).toContain('step 1 of 3, to come');
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  });

  it('shows the caption bubble unless asked not to, and keeps the spoken name either way', () => {
    expect(html).toContain('class="ladder-caption"');
    const quiet = ladderHtml(pieceRungs([2, 1, 0], 1), {
      caption: 'Pieces',
      showCaption: false,
      unit: 'pieces',
    });
    expect(quiet).not.toContain('ladder-caption');
    expect(quiet).toContain('aria-label="Pieces, from white to tan to gold"');
  });
});
