/**
 * The teacher's inbox page (M16e, D-049): the plain parts that need no page. What comes back from
 * the inbox is untrusted (a child typed those names), so everything here treats it as text only.
 */

export type Ext = 'stl' | 'png' | 'json';

/** One animal as the inbox function lists it: three files sharing a base name. */
export interface Animal {
  base: string;
  files: Partial<Record<Ext, { size: number }>>;
  createdAt: string;
}

/** What the animal's JSON file says, kept only if it has the right kind of value. */
export interface Meta {
  classCode: string | null;
  animal: string | null;
  fileName: string | null;
  pieces: number | null;
  createdAt: string | null;
}

const asText = (v: unknown, max = 200): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null;

/** Reads the animal's JSON file; anything odd gives empty values rather than an error. */
export function parseMeta(text: string): Meta {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = null;
  }
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const pieces =
    typeof o.pieces === 'number' && Number.isInteger(o.pieces) && o.pieces > 0 ? o.pieces : null;
  const created = asText(o.createdAt, 40);
  return {
    classCode: asText(o.classCode, 40),
    animal: asText(o.animal, 60),
    fileName: asText(o.fileName, 130),
    pieces: pieces && pieces < 1000 ? pieces : null,
    createdAt: created && !Number.isNaN(Date.parse(created)) ? created : null,
  };
}

/** The name to show for an animal: the exact words the student typed, else the file's base name. */
export function animalTitle(animal: Animal, meta: Meta | undefined): string {
  if (meta?.classCode && meta.animal) return `${meta.classCode} ${meta.animal}`;
  return animal.base;
}

/** How many files an animal has in the inbox. */
export const fileCount = (animal: Animal): number => Object.keys(animal.files).length;

/** How many files a whole list of animals has (what "Delete class" must promise to remove). */
export const totalFiles = (animals: readonly Animal[]): number =>
  animals.reduce((n, a) => n + fileCount(a), 0);

/** The path of one of an animal's files in the bucket. */
export const pathOf = (folder: string, animal: Animal, ext: Ext): string =>
  `${folder}/${animal.base}.${ext}`;

/** Characters a file name cannot hold on common systems. */
const unsafe = /[\\/:*?"<>|]/g;

/** A safe file name from the words the student typed. */
export function safeFileName(text: string): string {
  const printable = [...text].filter((c) => c.charCodeAt(0) >= 32).join('');
  const cleaned = printable.replace(unsafe, '').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
  return cleaned.slice(0, 120) || 'puzzle';
}

/**
 * Names for the files inside a ZIP: the student's own spelling ("6A Big Cat.stl"), made safe and
 * never repeated ("6A Big Cat (2).stl" if two share one).
 */
export function zipNames(titles: readonly string[], ext = 'stl'): string[] {
  const seen = new Map<string, number>();
  return titles.map((title) => {
    const base = safeFileName(title);
    const n = (seen.get(base.toLowerCase()) ?? 0) + 1;
    seen.set(base.toLowerCase(), n);
    return n === 1 ? `${base}.${ext}` : `${base} (${n}).${ext}`;
  });
}

/** The typed words match the class name (ignoring case and spaces at the ends). */
export const confirmMatches = (typed: string, folder: string): boolean =>
  typed.trim().toLowerCase() === folder.toLowerCase();

/** "5 minutes", "1 minute", "40 seconds" for a lock. */
export function waitText(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} seconds`;
  const m = Math.ceil(seconds / 60);
  return m === 1 ? '1 minute' : `${m} minutes`;
}

/** A plain-words line for something the inbox said when a delete was refused or failed. */
export function deleteProblem(status: number, data: Record<string, unknown> | null): string {
  const seconds = typeof data?.retryAfterSeconds === 'number' ? data.retryAfterSeconds : 0;
  switch (status) {
    case 401:
      return 'Wrong passcode. Nothing was deleted.';
    case 429:
      return `Too many wrong passcodes. Nothing was deleted. Try again in ${waitText(seconds || 900)}.`;
    case 503:
      return 'Deleting is switched off, because no passcode has been set up in the inbox. Nothing was deleted.';
    case 409:
      return 'This class changed while the question was open. Nothing was deleted. The list has been refreshed; please look and try again.';
    case 0:
      return 'Could not reach the inbox. Nothing was deleted. Check the connection and try again.';
    default:
      return 'The inbox could not delete that. Nothing was deleted. Try again in a moment.';
  }
}

/** Splits a list into chunks of at most `size`. */
export function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
