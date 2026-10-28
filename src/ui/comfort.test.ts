import { describe, expect, it } from 'vitest';
import { defaultComfort, parseComfort } from './comfort';

describe('parseComfort', () => {
  it('returns defaults when nothing is stored', () => {
    expect(parseComfort(null, false)).toEqual(defaultComfort(false));
  });

  it('follows the system reduced-motion preference by default', () => {
    expect(parseComfort(null, true).reduceMotion).toBe(true);
    expect(parseComfort(null, false).reduceMotion).toBe(false);
  });

  it('reads valid stored values and lets them override the system preference', () => {
    const raw = JSON.stringify({ calm: true, reduceMotion: false, textSize: 'large' });
    expect(parseComfort(raw, true)).toEqual({ calm: true, reduceMotion: false, textSize: 'large' });
  });

  it('ignores invalid fields and broken JSON', () => {
    const raw = JSON.stringify({ calm: 'yes', textSize: 'huge' });
    expect(parseComfort(raw, false)).toEqual(defaultComfort(false));
    expect(parseComfort('{not json', false)).toEqual(defaultComfort(false));
    expect(parseComfort('42', false)).toEqual(defaultComfort(false));
  });
});
