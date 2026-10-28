import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FILE_NAME,
  DEFAULT_PREFS,
  MAX_FILE_NAME,
  cleanFileName,
  parseTeacherPrefs,
  teacherIsOn,
} from './teacher';

describe('cleanFileName', () => {
  it('makes a safe name from what was typed', () => {
    expect(cleanFileName('Class 5B!')).toBe('class-5b');
    expect(cleanFileName('  Room  12  ')).toBe('room-12');
    expect(cleanFileName('a/b\\c:d')).toBe('a-b-c-d');
  });

  it('falls back to the standard name when nothing usable is left', () => {
    expect(cleanFileName('')).toBe(DEFAULT_FILE_NAME);
    expect(cleanFileName('   ')).toBe(DEFAULT_FILE_NAME);
    expect(cleanFileName('!!!')).toBe(DEFAULT_FILE_NAME);
  });

  it('keeps names short and never ends on a dash', () => {
    const name = cleanFileName('abcdefghij '.repeat(10));
    expect(name.length).toBeLessThanOrEqual(MAX_FILE_NAME);
    expect(name.endsWith('-')).toBe(false);
  });
});

describe('parseTeacherPrefs', () => {
  it('uses the standard settings for nothing, junk or the wrong kind of thing', () => {
    for (const raw of [null, '', 'not json', '5', 'null', '[]', '{"clearance":"wide"}']) {
      expect(parseTeacherPrefs(raw)).toEqual(DEFAULT_PREFS);
    }
  });

  it('reads good settings and cleans the file name', () => {
    const raw = JSON.stringify({
      clearance: 0.45,
      tabAmount: 'fewer',
      maxSizeMm: 120,
      relief: 'small',
      fileName: 'Year 4 Fish',
    });
    expect(parseTeacherPrefs(raw)).toEqual({
      clearance: 0.45,
      tabAmount: 'fewer',
      maxSizeMm: 120,
      relief: 'small',
      fileName: 'year-4-fish',
    });
  });

  it('clamps numbers that are out of range', () => {
    const prefs = parseTeacherPrefs(JSON.stringify({ clearance: 99, maxSizeMm: 1 }));
    expect(prefs.clearance).toBe(0.6);
    expect(prefs.maxSizeMm).toBe(60);
  });
});

describe('teacherIsOn', () => {
  it('is off for the standard settings and on for any change, even only the file name', () => {
    expect(teacherIsOn(DEFAULT_PREFS)).toBe(false);
    expect(teacherIsOn({ ...DEFAULT_PREFS, clearance: 0.4 })).toBe(true);
    expect(teacherIsOn({ ...DEFAULT_PREFS, tabAmount: 'more' })).toBe(true);
    expect(teacherIsOn({ ...DEFAULT_PREFS, maxSizeMm: 100 })).toBe(true);
    expect(teacherIsOn({ ...DEFAULT_PREFS, relief: 'medium' })).toBe(true);
    expect(teacherIsOn({ ...DEFAULT_PREFS, fileName: 'class-5b' })).toBe(true);
  });
});
