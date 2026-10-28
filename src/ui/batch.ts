import { MAX_BATCH } from '../core/export/batch';
import { parseProject, serializeProject, type Project } from '../core/project';

/**
 * The class batch is kept in this tab (session storage): a reload does not lose it, and closing
 * the tab does. Only outlines and settings are kept, never a photo or drawing.
 */
const STORAGE_KEY = 'hane.batch.v1';

/** Reads stored JSON; entries that are not valid projects are dropped, and the list is capped. */
export function parseBatch(raw: string | null): Project[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const projects: Project[] = [];
    for (const entry of data) {
      const parsed = parseProject(JSON.stringify(entry));
      if (parsed.ok) projects.push(parsed.project);
      if (projects.length >= MAX_BATCH) break;
    }
    return projects;
  } catch {
    return [];
  }
}

export function loadBatch(): Project[] {
  try {
    return parseBatch(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

export function saveBatch(projects: readonly Project[]): void {
  try {
    const entries = projects.map((p) => JSON.parse(serializeProject(p)) as unknown);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage can be blocked; the batch then lasts until the page is reloaded.
  }
}
