import type { InboxConfig } from '../ui/inbox';
import type { Animal } from './model';

/**
 * Talks to the inbox function (inbox/functions/inbox-admin). The public key goes in both headers
 * Supabase looks at. The passcode is only ever sent for a delete, in the body of that one request.
 */

export interface Reply {
  /** The HTTP status, or 0 when the inbox could not be reached at all. */
  status: number;
  data: Record<string, unknown> | null;
}

export type Doer = typeof fetch;

export interface InboxApi {
  folders(): Promise<{ folder: string; animals: number }[]>;
  animals(folder: string): Promise<Animal[]>;
  /** Short download links by path; a path that does not exist is left out. */
  sign(paths: string[]): Promise<Record<string, string>>;
  deleteAnimal(folder: string, base: string, passcode: string): Promise<Reply>;
  deleteClass(folder: string, expected: number, passcode: string): Promise<Reply>;
}

export function inboxApi(config: InboxConfig, doFetch: Doer = fetch): InboxApi {
  const address = `${config.url}/functions/v1/inbox-admin`;

  async function post(body: Record<string, unknown>): Promise<Reply> {
    try {
      const res = await doFetch(address, {
        method: 'POST',
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      let data: Record<string, unknown> | null = null;
      try {
        const parsed: unknown = await res.json();
        if (typeof parsed === 'object' && parsed !== null) data = parsed as Record<string, unknown>;
      } catch {
        data = null;
      }
      return { status: res.status, data };
    } catch {
      return { status: 0, data: null };
    }
  }

  async function mustWork(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const r = await post(body);
    if (r.status !== 200 || !r.data) throw new Error(`inbox answered ${r.status}`);
    return r.data;
  }

  return {
    async folders() {
      const data = await mustWork({ action: 'list' });
      const rows = Array.isArray(data.folders) ? (data.folders as unknown[]) : [];
      return rows.flatMap((r) => {
        const o = (typeof r === 'object' && r !== null ? r : {}) as {
          folder?: unknown;
          animals?: unknown;
        };
        return typeof o.folder === 'string' && typeof o.animals === 'number'
          ? [{ folder: o.folder, animals: o.animals }]
          : [];
      });
    },
    async animals(folder) {
      const data = await mustWork({ action: 'list', folder });
      const rows = Array.isArray(data.animals) ? (data.animals as unknown[]) : [];
      return rows.flatMap((r) => {
        const o = (typeof r === 'object' && r !== null ? r : {}) as Partial<Animal>;
        if (typeof o.base !== 'string' || typeof o.files !== 'object' || o.files === null)
          return [];
        const files: Animal['files'] = {};
        for (const ext of ['stl', 'png', 'json'] as const)
          if (o.files[ext]) files[ext] = { size: 0 };
        return [
          { base: o.base, files, createdAt: typeof o.createdAt === 'string' ? o.createdAt : '' },
        ];
      });
    },
    async sign(paths) {
      const data = await mustWork({ action: 'sign', paths });
      const urls: Record<string, string> = {};
      const given = (data.urls ?? {}) as Record<string, unknown>;
      for (const [path, url] of Object.entries(given)) {
        // Only links into this inbox are ever followed.
        if (typeof url === 'string' && url.startsWith(`${config.url}/`)) urls[path] = url;
      }
      return urls;
    },
    deleteAnimal: (folder, base, passcode) =>
      post({ action: 'delete', passcode, folder, base, confirm: folder }),
    deleteClass: (folder, expected, passcode) =>
      post({ action: 'delete', passcode, folder, expected, confirm: folder }),
  };
}
