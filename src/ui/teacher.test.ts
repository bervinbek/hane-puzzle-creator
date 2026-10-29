import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, parseTeacherPrefs, teacherIsOn } from './teacher';

describe('parseTeacherPrefs', () => {
  it('uses the standard settings for nothing, junk or the wrong kind of thing', () => {
    for (const raw of [null, '', 'not json', '5', 'null', '[]', '{"clearance":"wide"}']) {
      expect(parseTeacherPrefs(raw)).toEqual(DEFAULT_PREFS);
    }
  });

  it('reads good settings, and ignores a file name stored by an older version', () => {
    const raw = JSON.stringify({
      clearance: 0.45,
      tabAmount: 'fewer',
      maxSizeMm: 120,
      relief: 'small',
      magnetFit: 0.3,
      fileName: 'Year 4 Fish',
    });
    expect(parseTeacherPrefs(raw)).toEqual({
      clearance: 0.45,
      tabAmount: 'fewer',
      maxSizeMm: 120,
      relief: 'small',
      magnetFit: 0.3,
    });
  });

  it('clamps numbers that are out of range', () => {
    const prefs = parseTeacherPrefs(JSON.stringify({ clearance: 99, maxSizeMm: 1 }));
    expect(prefs.clearance).toBe(0.6);
    expect(prefs.maxSizeMm).toBe(60);
  });
});

describe('teacherIsOn', () => {
  it('is off for the standard settings and on for any change', () => {
    expect(teacherIsOn(DEFAULT_PREFS)).toBe(false);
    expect(teacherIsOn({ ...DEFAULT_PREFS, clearance: 0.4 })).toBe(true);
    expect(teacherIsOn({ ...DEFAULT_PREFS, tabAmount: 'more' })).toBe(true);
    expect(teacherIsOn({ ...DEFAULT_PREFS, maxSizeMm: 100 })).toBe(true);
    expect(teacherIsOn({ ...DEFAULT_PREFS, relief: 'medium' })).toBe(true);
  });
});
