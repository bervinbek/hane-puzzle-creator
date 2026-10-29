import {
  DEFAULT_TEACHER,
  isDefaultTeacher,
  sanitiseTeacher,
  type TeacherSettings,
} from '../core/puzzle/settings';

/** Teacher options kept on this device: the print settings. */
export type TeacherPrefs = TeacherSettings;

export const DEFAULT_PREFS: TeacherPrefs = DEFAULT_TEACHER;

const STORAGE_KEY = 'hane.teacher.v1';

/** Parses stored JSON; anything missing or invalid falls back to the standard settings. */
export function parseTeacherPrefs(raw: string | null): TeacherPrefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    // Older versions also stored a file name here; it is ignored now.
    return sanitiseTeacher(JSON.parse(raw));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function loadTeacher(): TeacherPrefs {
  try {
    return parseTeacherPrefs(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveTeacher(prefs: TeacherPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage can be blocked (private windows); settings then last for this visit only.
  }
}

/** True when anything differs from the standard, so the header can say so. */
export function teacherIsOn(prefs: TeacherPrefs): boolean {
  return !isDefaultTeacher(prefs);
}
