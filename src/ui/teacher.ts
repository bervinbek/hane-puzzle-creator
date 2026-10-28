import { safeName } from '../core/export/bundle';
import {
  DEFAULT_TEACHER,
  isDefaultTeacher,
  sanitiseTeacher,
  type TeacherSettings,
} from '../core/puzzle/settings';

/** Teacher options kept on this device: the print settings, plus what to call the files. */
export interface TeacherPrefs extends TeacherSettings {
  /** Start of every file name, e.g. "class-5b" gives class-5b-yellow-6-pieces.stl. */
  fileName: string;
}

export const DEFAULT_FILE_NAME = 'hane-puzzle';
export const MAX_FILE_NAME = 30;

export const DEFAULT_PREFS: TeacherPrefs = { ...DEFAULT_TEACHER, fileName: DEFAULT_FILE_NAME };

const STORAGE_KEY = 'hane.teacher.v1';

/** Turns anything typed into a safe start for a file name: lower case letters, digits and dashes. */
export function cleanFileName(raw: string): string {
  const cleaned = safeName([raw]).slice(0, MAX_FILE_NAME).replace(/-+$/, '');
  return cleaned || DEFAULT_FILE_NAME;
}

/** Parses stored JSON; anything missing or invalid falls back to the standard settings. */
export function parseTeacherPrefs(raw: string | null): TeacherPrefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const data: unknown = JSON.parse(raw);
    const name =
      typeof data === 'object' && data !== null
        ? (data as Record<string, unknown>).fileName
        : undefined;
    return {
      ...sanitiseTeacher(data),
      fileName: typeof name === 'string' ? cleanFileName(name) : DEFAULT_FILE_NAME,
    };
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
  return !isDefaultTeacher(prefs) || prefs.fileName !== DEFAULT_FILE_NAME;
}
