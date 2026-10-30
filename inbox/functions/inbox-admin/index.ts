/**
 * Supabase Edge Function `inbox-admin` (M16e, D-049): lets the teacher's inbox page list the class
 * folders, get short download links, and delete. Listing and links are open to anyone who calls it;
 * deleting needs the passcode, which is compared HERE, on the server, because a check inside the
 * page would protect nothing (the site's files are public).
 *
 * One file with no imports, so it can be pasted into the Supabase dashboard as it is. It talks to
 * storage and the attempts table through their REST addresses with the service key that Supabase
 * puts in every function's environment (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). The passcode
 * is the secret `INBOX_PASSCODE`. None of them is ever written to a reply or a log.
 *
 * Everything but the last few lines is plain web-standard code and is tested in Node
 * (tests/inboxAdmin.test.ts). Setup: inbox/README.md.
 */

// ---- What may be touched -------------------------------------------------------------------

/** A class folder: the same rule as the storage policy in inbox/supabase.sql. */
export const FOLDER_RULE = /^[a-z0-9_-]{1,24}$/;
/** The part of a file name before the extension (same rule as the policy). */
export const BASE_RULE = /^[A-Za-z0-9._() +-]{1,100}$/;
/** A whole path in the bucket: `<folder>/<base>.stl|png|json`. */
export const PATH_RULE = /^[a-z0-9_-]{1,24}\/[A-Za-z0-9._() +-]{1,100}\.(stl|png|json)$/;
const EXTENSIONS = ['stl', 'png', 'json'] as const;
type Extension = (typeof EXTENSIONS)[number];

const BUCKET = 'puzzles';
/** Download links last this long. */
export const LINK_SECONDS = 600;
/** Most paths one `sign` call may ask for. */
export const MAX_SIGN = 100;
/** This many wrong passcodes within the window lock deleting. */
export const LOCK_AFTER = 5;
export const LOCK_WINDOW_MS = 15 * 60 * 1000;
/** Old failure rows are removed after this long. */
const KEEP_FAILURES_MS = 24 * 60 * 60 * 1000;
const MAX_BODY_CHARS = 20_000;
/** A passcode shorter than this is not accepted as a setting: deleting stays switched off. */
export const MIN_PASSCODE = 8;
const MAX_PASSCODE_GIVEN = 200;

// ---- What the handler needs, passed in so tests can fake it -------------------------------

export interface StoredFile {
  /** The name inside the folder, like `6A Big Cat.stl`. */
  name: string;
  size: number;
  createdAt: string;
}

export interface Store {
  /** The class folders (top-level names). */
  folders(): Promise<string[]>;
  /** Every file inside one folder. */
  files(folder: string): Promise<StoredFile[]>;
  /** A download link for each path that exists, by path. */
  sign(paths: string[], seconds: number): Promise<Record<string, string>>;
  /** Removes the files; returns how many were really removed (a missing file is not counted). */
  remove(paths: string[]): Promise<number>;
}

export interface Failure {
  id: string | number;
  at: Date;
}

export interface Attempts {
  /** The most recent wrong passcodes since `since`, newest first, at most `limit`. */
  recentFailures(since: Date, limit: number): Promise<Failure[]>;
  /** Notes a try (before it is checked, so a burst of parallel tries is all counted). */
  recordFailure(at: Date): Promise<Failure['id']>;
  /** Takes back one note: the try turned out to be refused, or right. */
  forget(id: Failure['id']): Promise<void>;
  clearFailures(): Promise<void>;
  purgeBefore(before: Date): Promise<void>;
}

export interface Deps {
  store: Store;
  attempts: Attempts;
  /** The secret passcode; when missing, deleting is switched off. */
  passcode: string | undefined;
  now: () => Date;
}

// ---- Replies -------------------------------------------------------------------------------

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '600',
};

function reply(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
  });
}

const fail = (status: number, error: string, message: string, extra?: Record<string, unknown>) =>
  reply(status, { error, message, ...extra });

// ---- Small helpers -------------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isFolder = (v: unknown): v is string => typeof v === 'string' && FOLDER_RULE.test(v);
const isBase = (v: unknown): v is string => typeof v === 'string' && BASE_RULE.test(v);

async function digest(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/** Compares two texts without the time depending on where they differ or how long they are. */
export async function sameText(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Splits `6A Big Cat.stl` into its base and extension; null when it is not one of our files. */
export function splitName(name: string): { base: string; ext: Extension } | null {
  const dot = name.lastIndexOf('.');
  if (dot < 1) return null;
  const base = name.slice(0, dot);
  const ext = name.slice(dot + 1);
  if (!isBase(base) || !(EXTENSIONS as readonly string[]).includes(ext)) return null;
  return { base, ext: ext as Extension };
}

export interface Animal {
  base: string;
  files: Partial<Record<Extension, { size: number }>>;
  createdAt: string;
}

/** Groups a folder's files by animal (the three files share a base name). */
export function groupAnimals(files: readonly StoredFile[]): Animal[] {
  const byBase = new Map<string, Animal>();
  for (const f of files) {
    const parts = splitName(f.name);
    if (!parts) continue;
    let animal = byBase.get(parts.base);
    if (!animal) {
      animal = { base: parts.base, files: {}, createdAt: f.createdAt };
      byBase.set(parts.base, animal);
    }
    animal.files[parts.ext] = { size: f.size };
    if (f.createdAt < animal.createdAt) animal.createdAt = f.createdAt;
  }
  return [...byBase.values()].sort((a, b) => a.base.localeCompare(b.base));
}

// ---- The handler ---------------------------------------------------------------------------

export async function handle(request: Request, deps: Deps): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return fail(405, 'method', 'Use POST.');

  let text: string;
  try {
    text = await request.text();
  } catch {
    return fail(400, 'body', 'The request could not be read.');
  }
  if (text.length > MAX_BODY_CHARS) return fail(413, 'body', 'The request is too large.');
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return fail(400, 'body', 'The request is not JSON.');
  }
  if (!isObject(body) || typeof body.action !== 'string') {
    return fail(400, 'body', 'The request needs an action.');
  }

  try {
    switch (body.action) {
      case 'list':
        return await list(body, deps);
      case 'sign':
        return await sign(body, deps);
      case 'delete':
        return await remove(body, deps);
      default:
        return fail(400, 'action', 'Unknown action.');
    }
  } catch {
    // The reason stays out of the reply: it could name internals, and must never echo the request.
    return fail(500, 'server', 'The inbox could not do that. Try again in a moment.');
  }
}

async function list(body: Record<string, unknown>, { store }: Deps): Promise<Response> {
  if (body.folder === undefined) {
    const names = (await store.folders()).filter((n) => FOLDER_RULE.test(n)).sort();
    const folders = await Promise.all(
      names.map(async (folder) => ({
        folder,
        animals: groupAnimals(await store.files(folder)).length,
      })),
    );
    return reply(200, { folders });
  }
  if (!isFolder(body.folder)) return fail(400, 'folder', 'That is not a class folder.');
  const animals = groupAnimals(await store.files(body.folder));
  return reply(200, { folder: body.folder, animals });
}

async function sign(body: Record<string, unknown>, { store }: Deps): Promise<Response> {
  const paths = body.paths;
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > MAX_SIGN) {
    return fail(400, 'paths', `Ask for between 1 and ${MAX_SIGN} files.`);
  }
  if (!paths.every((p) => typeof p === 'string' && PATH_RULE.test(p))) {
    return fail(400, 'paths', 'One of the file names is not allowed.');
  }
  const urls = await store.sign([...new Set(paths as string[])], LINK_SECONDS);
  return reply(200, { urls, expiresIn: LINK_SECONDS });
}

async function remove(body: Record<string, unknown>, deps: Deps): Promise<Response> {
  const { store, attempts, passcode, now } = deps;
  // Shape first: a malformed request is never counted as a wrong passcode.
  if (!isFolder(body.folder)) return fail(400, 'folder', 'That is not a class folder.');
  const folder = body.folder;
  if (body.base !== undefined && !isBase(body.base)) {
    return fail(400, 'base', 'That is not an animal name.');
  }
  const base = typeof body.base === 'string' ? body.base : undefined;
  if (base === undefined && !Number.isInteger(body.expected)) {
    return fail(400, 'expected', 'Deleting a class needs the number of files that was shown.');
  }
  if (body.confirm !== folder) {
    return fail(400, 'confirm', 'The class name to confirm does not match.');
  }
  if (!passcode || passcode.length < MIN_PASSCODE) {
    return fail(503, 'off', 'Deleting is switched off: no passcode has been set.');
  }

  // The try is written down BEFORE it is counted or checked, so a burst of parallel tries cannot
  // all see "no wrong tries yet". If the table cannot be used, the error stops everything here.
  const at = now();
  const mine = await attempts.recordFailure(at);
  const recent = await attempts.recentFailures(
    new Date(at.getTime() - LOCK_WINDOW_MS),
    LOCK_AFTER + 1,
  );
  const others = recent.filter((r) => r.id !== mine);
  const fifth = others[LOCK_AFTER - 1];
  if (fifth) {
    // Locked: refuse without comparing, so a correct passcode also has to wait. The refused try
    // does not count against the lock.
    await attempts.forget(mine);
    const seconds = Math.max(
      1,
      Math.ceil((fifth.at.getTime() + LOCK_WINDOW_MS - at.getTime()) / 1000),
    );
    return fail(429, 'locked', 'Too many wrong passcodes. Try again later.', {
      retryAfterSeconds: seconds,
    });
  }

  const given = typeof body.passcode === 'string' ? body.passcode : '';
  if (given === '' || given.length > MAX_PASSCODE_GIVEN || !(await sameText(given, passcode))) {
    await attempts.purgeBefore(new Date(at.getTime() - KEEP_FAILURES_MS));
    return fail(401, 'passcode', 'Wrong passcode. Nothing was deleted.');
  }
  await attempts.clearFailures();

  if (base !== undefined) {
    // One animal: exactly its three files, never a prefix match ("cat" must not take "cat (2)").
    const paths = EXTENSIONS.map((ext) => `${folder}/${base}.${ext}`);
    const deleted = await store.remove(paths);
    return reply(200, { deleted, folder, base });
  }

  // A whole class: only if it still holds the number of files that the teacher was shown.
  const found = (await store.files(folder))
    .map((f) => `${folder}/${f.name}`)
    .filter((p) => PATH_RULE.test(p));
  if (found.length !== body.expected) {
    return fail(409, 'changed', 'The class changed since it was shown. Look again, then retry.', {
      found: found.length,
    });
  }
  let deleted = 0;
  for (let i = 0; i < found.length; i += 100) {
    deleted += await store.remove(found.slice(i, i + 100));
  }
  const remaining = (await store.files(folder)).length;
  return reply(200, { deleted, folder, remaining });
}

// ---- Storage and the attempts table, through their REST addresses ---------------------------

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

function headers(key: string, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

async function ok(response: Response): Promise<Response> {
  // Only the status is kept: a storage error body is never passed on.
  if (!response.ok) throw new Error(`storage answered ${response.status}`);
  return response;
}

export function restStore(url: string, key: string, doFetch: Fetch = fetch): Store {
  const api = `${url}/storage/v1`;
  const json = { 'Content-Type': 'application/json' };

  async function page(
    prefix: string,
  ): Promise<{ name: string; id: string | null; size: number; createdAt: string }[]> {
    const out: { name: string; id: string | null; size: number; createdAt: string }[] = [];
    const LIMIT = 1000;
    for (let offset = 0; offset < 20 * LIMIT; offset += LIMIT) {
      const res = await ok(
        await doFetch(`${api}/object/list/${BUCKET}`, {
          method: 'POST',
          headers: headers(key, json),
          body: JSON.stringify({
            prefix,
            limit: LIMIT,
            offset,
            sortBy: { column: 'name', order: 'asc' },
          }),
        }),
      );
      const rows = (await res.json()) as {
        name: string;
        id: string | null;
        created_at?: string;
        metadata?: { size?: number } | null;
      }[];
      for (const r of rows) {
        out.push({
          name: r.name,
          id: r.id,
          size: r.metadata?.size ?? 0,
          createdAt: r.created_at ?? '',
        });
      }
      if (rows.length < LIMIT) break;
    }
    return out;
  }

  return {
    async folders() {
      // At the top level a folder has no id; a stray file would have one.
      return (await page('')).filter((r) => r.id === null).map((r) => r.name);
    },
    async files(folder) {
      return (await page(folder))
        .filter((r) => r.id !== null)
        .map((r) => ({ name: r.name, size: r.size, createdAt: r.createdAt }));
    },
    async sign(paths, seconds) {
      const res = await ok(
        await doFetch(`${api}/object/sign/${BUCKET}`, {
          method: 'POST',
          headers: headers(key, json),
          body: JSON.stringify({ expiresIn: seconds, paths }),
        }),
      );
      const rows = (await res.json()) as {
        path?: string;
        signedURL?: string | null;
        error?: unknown;
      }[];
      const urls: Record<string, string> = {};
      for (const r of rows) {
        if (typeof r.path === 'string' && typeof r.signedURL === 'string' && !r.error) {
          urls[r.path] = `${api}${r.signedURL}`;
        }
      }
      return urls;
    },
    async remove(paths) {
      const res = await ok(
        await doFetch(`${api}/object/${BUCKET}`, {
          method: 'DELETE',
          headers: headers(key, json),
          body: JSON.stringify({ prefixes: paths }),
        }),
      );
      // Storage answers with the objects it really removed; a missing file is not in the list.
      const removed = await res.json();
      return Array.isArray(removed) ? removed.length : 0;
    },
  };
}

export function restAttempts(url: string, key: string, doFetch: Fetch = fetch): Attempts {
  const table = `${url}/rest/v1/inbox_attempts`;
  const iso = (d: Date) => encodeURIComponent(d.toISOString());
  const writes = { 'Content-Type': 'application/json' };
  return {
    async recentFailures(since, limit) {
      const res = await ok(
        await doFetch(
          `${table}?ok=eq.false&at=gte.${iso(since)}&select=id,at&order=at.desc,id.desc&limit=${limit}`,
          { headers: headers(key) },
        ),
      );
      return ((await res.json()) as { id: string | number; at: string }[]).map((r) => ({
        id: r.id,
        at: new Date(r.at),
      }));
    },
    async recordFailure(at) {
      const res = await ok(
        await doFetch(table, {
          method: 'POST',
          headers: headers(key, { ...writes, Prefer: 'return=representation' }),
          body: JSON.stringify({ at: at.toISOString(), ok: false }),
        }),
      );
      const rows = (await res.json()) as { id?: string | number }[];
      const id = rows[0]?.id;
      if (id === undefined) throw new Error('the attempt was not stored');
      return id;
    },
    async forget(id) {
      await ok(
        await doFetch(`${table}?id=eq.${encodeURIComponent(String(id))}`, {
          method: 'DELETE',
          headers: headers(key),
        }),
      );
    },
    async clearFailures() {
      await ok(await doFetch(`${table}?ok=eq.false`, { method: 'DELETE', headers: headers(key) }));
    },
    async purgeBefore(before) {
      await ok(
        await doFetch(`${table}?at=lt.${iso(before)}`, { method: 'DELETE', headers: headers(key) }),
      );
    },
  };
}

// ---- Start-up (the only part the Node tests do not run; Deno exists only on Supabase) -------

declare const Deno:
  | {
      serve(handler: (request: Request) => Response | Promise<Response>): unknown;
      env: { get(name: string): string | undefined };
    }
  | undefined;

if (typeof Deno !== 'undefined') {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const deps: Deps = {
    store: restStore(url, key),
    attempts: restAttempts(url, key),
    passcode: Deno.env.get('INBOX_PASSCODE') || undefined,
    now: () => new Date(),
  };
  Deno.serve((request) => handle(request, deps));
}
