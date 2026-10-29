import { bounds } from '../geometry/polygon';
import type { Puzzle } from '../puzzle/generate';
import { animalFileName, tidyFileText } from './fileName';

/**
 * Names for the class inbox (D-049): one folder per class code, and three files per animal in it.
 * Pure text rules; nothing here touches the network or the page.
 */

/** The most characters of a class code that are kept. */
export const MAX_CLASS_CODE_LETTERS = 20;

/** The class code as it is shown and used in the file name: spelling kept, tidied. */
export function classCodeText(raw: string): string {
  return tidyFileText(raw, MAX_CLASS_CODE_LETTERS);
}

/**
 * The file name (without ".stl") a student downloads: the class code, a space, then the animal,
 * "6A Big Cat". Empty when either part has no letter or number, which means "ask again".
 */
export function classFileName(code: string, animal: string): string {
  const c = classCodeText(code);
  const a = animalFileName(animal);
  return c && a ? `${c} ${a}` : '';
}

/** A short, fixed fingerprint of some text (FNV-1a), for names that have no plain letters left. */
function hash8(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const withoutMarks = (text: string): string => text.normalize('NFKD').replace(/\p{M}/gu, '');

/**
 * The folder for a class code. "6A", "6a" and "6 a" all give "6a": lower case, plain letters,
 * digits, "-" and "_" only, at most 24 characters. A code with none of those (a class named in
 * another script) becomes "c-" and a fingerprint of the code, so it still has a stable folder.
 * Empty when the code is not usable.
 */
export function classFolder(code: string): string {
  const text = classCodeText(code);
  if (!text) return '';
  const plain = withoutMarks(text)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 24);
  return /[a-z0-9]/.test(plain) ? plain : `c-${hash8(text.toLowerCase())}`;
}

/** Plain characters a storage key may hold (what the inbox rule allows), from any text. */
function plainText(text: string): string {
  const plain = withoutMarks(text)
    .replace(/[^A-Za-z0-9._() +-]/g, '')
    .replace(/ {2,}/g, ' ')
    .replace(/^[ .+-]+|[ .+-]+$/g, '');
  return /[A-Za-z0-9]/.test(plain) ? plain : '';
}

/**
 * The name the three files share in the inbox, like the download's file name but in plain
 * characters, because the inbox's storage refuses anything else: "6A Big Cat", and for a name in
 * another script "6A animal-1a2b3c4d". The exact spelling is kept in the JSON file, not here.
 * Empty when the code or the animal is not usable.
 */
export function inboxBase(code: string, animal: string): string {
  const c = classCodeText(code);
  const a = animalFileName(animal);
  if (!c || !a) return '';
  const codePart = plainText(c) || classFolder(code);
  const animalPart = plainText(a).slice(0, 60) || `animal-${hash8(a)}`;
  return `${codePart} ${animalPart}`;
}

/** Where one file of the set goes. `copy` 2 and up are for a name that is already taken. */
export function inboxKey(
  folder: string,
  base: string,
  copy: number,
  ext: 'stl' | 'png' | 'json',
): string {
  return `${folder}/${copy > 1 ? `${base} (${copy})` : base}.${ext}`;
}

/** The rule the inbox's storage enforces on every key; used to check ours before sending. */
export const INBOX_KEY_PATTERN = /^[a-z0-9_-]{1,24}\/[A-Za-z0-9._() +-]{1,100}\.(stl|png|json)$/;

export interface InboxRecord {
  classCode: string;
  animal: string;
  fileName: string;
  pieces: number;
  seed: number;
  gapMm: number;
  /** When the file was made, as an ISO time. */
  createdAt: string;
}

/** The small JSON beside each STL: fixed fields only, so nothing else can slip into it. */
export function inboxJson(r: InboxRecord): string {
  return JSON.stringify(
    {
      app: 'hane-puzzle-generator',
      version: 1,
      classCode: r.classCode,
      animal: r.animal,
      fileName: r.fileName,
      pieces: r.pieces,
      seed: r.seed,
      gapMm: r.gapMm,
      createdAt: r.createdAt,
    },
    null,
    2,
  );
}

export interface ThumbnailLayout {
  width: number;
  height: number;
  /** Pixels per millimetre. */
  scale: number;
  /** Where a point (x, y) in millimetres lands: px = (x - minX) * scale + margin, and y is flipped. */
  minX: number;
  maxY: number;
  margin: number;
}

/** How the flat 2D view of a puzzle is laid out in a picture whose longest side is `size` px. */
export function thumbnailLayout(puzzle: Puzzle, size = 512, margin = 16): ThumbnailLayout {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const piece of puzzle.pieces) {
    const b = bounds(piece.polygon);
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  if (!Number.isFinite(minX))
    return { width: size, height: size, scale: 1, minX: 0, maxY: 0, margin };
  const extent = Math.max(maxX - minX, maxY - minY, 1);
  const scale = (size - 2 * margin) / extent;
  return {
    width: Math.ceil((maxX - minX) * scale + 2 * margin),
    height: Math.ceil((maxY - minY) * scale + 2 * margin),
    scale,
    minX,
    maxY,
    margin,
  };
}
