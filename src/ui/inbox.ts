import { inboxKey, thumbnailLayout } from '../core/export/classInbox';
import type { Puzzle } from '../core/puzzle/generate';
import { greedyColouring } from '../core/puzzle/colouring';
import { FILAMENTS } from './presets';

/**
 * The class inbox (D-049): where Download can send a copy of the finished puzzle.
 *
 * It only exists when the build was given an address and a public key. The address and key are
 * public by design (the storage rules, not secrecy, keep the inbox safe). Without them the page
 * never asks for a class code and never sends anything.
 */

export interface InboxConfig {
  /** The project address, without a trailing slash. */
  url: string;
  /** The public key. */
  key: string;
}

interface Env {
  VITE_INBOX_URL?: unknown;
  VITE_INBOX_KEY?: unknown;
}

/** The inbox this build sends to, or null when it was built without one. */
export function inboxConfig(env: Env = import.meta.env as Env): InboxConfig | null {
  const url = typeof env.VITE_INBOX_URL === 'string' ? env.VITE_INBOX_URL.trim() : '';
  const key = typeof env.VITE_INBOX_KEY === 'string' ? env.VITE_INBOX_KEY.trim() : '';
  if (!/^https:\/\/[^\s/]+$/.test(url.replace(/\/+$/, '')) || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

// ---- The class code, remembered for this tab -------------------------------------------------

const CODE_KEY = 'hane.classCode';

/** The class code typed earlier in this tab, so a class on one laptop does not retype it. */
export function rememberedClassCode(): string {
  try {
    return sessionStorage.getItem(CODE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function rememberClassCode(code: string): void {
  try {
    sessionStorage.setItem(CODE_KEY, code);
  } catch {
    // Private windows can refuse storage; the code is just not remembered.
  }
}

// ---- The flat 2D view ----------------------------------------------------------------------

/** The cut pieces drawn flat, as a PNG (the filament colours, a dark line, no photo, no drawing). */
export async function renderPng(puzzle: Puzzle): Promise<Uint8Array> {
  const l = thumbnailLayout(puzzle, 512, 16);
  const canvas = document.createElement('canvas');
  canvas.width = l.width;
  canvas.height = l.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas');
  ctx.fillStyle = '#f3efe6';
  ctx.fillRect(0, 0, l.width, l.height);
  const colours = greedyColouring(puzzle.neighbours, FILAMENTS.length);
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#4a3b2a';
  puzzle.pieces.forEach((piece, i) => {
    ctx.beginPath();
    piece.polygon.forEach(([x, y], k) => {
      const px = (x - l.minX) * l.scale + l.margin;
      const py = (l.maxY - y) * l.scale + l.margin;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = FILAMENTS[colours[i] ?? 0]?.hex ?? '#E0A82E';
    ctx.fill();
    ctx.stroke();
  });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('No picture');
  return new Uint8Array(await blob.arrayBuffer());
}

// ---- Sending -------------------------------------------------------------------------------

export type SendOutcome = 'sent' | 'offline' | 'too-big' | 'refused' | 'error';

export interface SendFile {
  ext: 'stl' | 'png' | 'json';
  type: string;
  bytes: Uint8Array;
  done: boolean;
}

/** One animal's three files on their way. Kept so a second try carries on where the first stopped. */
export interface SendJob {
  folder: string;
  base: string;
  files: SendFile[];
  /** 1 for the plain name; 2 and up when the name is already taken in this folder. */
  copy: number;
}

/** The most "(2)", "(3)"... copies tried before giving up. */
const MAX_COPIES = 20;

export function newSendJob(
  folder: string,
  base: string,
  stl: Uint8Array,
  png: Uint8Array,
  json: string,
): SendJob {
  return {
    folder,
    base,
    copy: 1,
    files: [
      { ext: 'stl', type: 'model/stl', bytes: stl, done: false },
      { ext: 'png', type: 'image/png', bytes: png, done: false },
      { ext: 'json', type: 'application/json', bytes: new TextEncoder().encode(json), done: false },
    ],
  };
}

/** The address one file is added at. Each part of the path is escaped; the "/" stays. */
function objectUrl(config: InboxConfig, key: string): string {
  const path = key.split('/').map(encodeURIComponent).join('/');
  return `${config.url}/storage/v1/object/puzzles/${path}`;
}

/**
 * Adds the job's files to the inbox, STL first. The inbox only adds, never overwrites: a name that
 * is taken answers "already exists", and the whole set moves to "(2)", "(3)"... Safe to call again
 * after a failure: files that already went are not sent twice.
 */
export async function sendJob(
  config: InboxConfig,
  job: SendJob,
  doFetch: typeof fetch = fetch,
): Promise<SendOutcome> {
  for (;;) {
    let renamed = false;
    for (const file of job.files) {
      if (file.done) continue;
      let res: Response;
      try {
        res = await doFetch(objectUrl(config, inboxKey(job.folder, job.base, job.copy, file.ext)), {
          method: 'POST',
          headers: {
            apikey: config.key,
            Authorization: `Bearer ${config.key}`,
            'Content-Type': file.type,
          },
          body: new Blob([file.bytes as unknown as BlobPart], { type: file.type }),
        });
      } catch {
        return 'offline';
      }
      if (res.ok) {
        file.done = true;
        continue;
      }
      const body = (await res.json().catch(() => null)) as { code?: string } | null;
      switch (body?.code) {
        case 'KeyAlreadyExists':
          if (job.files.some((f) => f.done)) {
            // The first file went in under this name, so this one belongs to the same set.
            file.done = true;
            continue;
          }
          job.copy += 1;
          if (job.copy > MAX_COPIES) return 'error';
          renamed = true;
          break;
        case 'EntityTooLarge':
          return 'too-big';
        case 'AccessDenied':
        case 'InvalidMimeType':
        case 'InvalidKey':
          return 'refused';
        default:
          return 'error';
      }
      if (renamed) break;
    }
    if (!renamed) return 'sent';
  }
}
