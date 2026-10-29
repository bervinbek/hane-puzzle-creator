import { describe, expect, it } from 'vitest';
import { INBOX_KEY_PATTERN } from '../core/export/classInbox';
import { inboxConfig, newSendJob, sendJob, type InboxConfig } from './inbox';

const config: InboxConfig = { url: 'https://inbox.example.test', key: 'public-key' };

const job = () =>
  newSendJob('6a', '6A Big Cat', new Uint8Array([1, 2, 3]), new Uint8Array([4, 5]), '{"a":1}');

interface Call {
  path: string;
  type: string | null;
  apikey: string | null;
  auth: string | null;
  size: number;
}

/** A pretend inbox: answers each request from `reply`, and remembers what was asked. */
function pretend(reply: (call: Call, n: number) => Response | Error) {
  const calls: Call[] = [];
  const doFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const body = init?.body as Blob;
    const call: Call = {
      path: decodeURIComponent(new URL(String(url)).pathname),
      type: headers.get('content-type'),
      apikey: headers.get('apikey'),
      auth: headers.get('authorization'),
      size: body.size,
    };
    calls.push(call);
    const r = reply(call, calls.length);
    if (r instanceof Error) throw r;
    return r;
  }) as typeof fetch;
  return { calls, doFetch };
}

const ok = () => new Response('{}', { status: 200 });
const refuse = (code: string) => new Response(JSON.stringify({ code }), { status: 400 });

describe('inboxConfig', () => {
  it('needs an https address and a key', () => {
    expect(inboxConfig({})).toBeNull();
    expect(inboxConfig({ VITE_INBOX_URL: '', VITE_INBOX_KEY: '' })).toBeNull();
    expect(inboxConfig({ VITE_INBOX_URL: 'https://a.test', VITE_INBOX_KEY: '' })).toBeNull();
    expect(inboxConfig({ VITE_INBOX_URL: '', VITE_INBOX_KEY: 'k' })).toBeNull();
    expect(inboxConfig({ VITE_INBOX_URL: 'http://a.test', VITE_INBOX_KEY: 'k' })).toBeNull();
    expect(inboxConfig({ VITE_INBOX_URL: 'https://a.test/x/y', VITE_INBOX_KEY: 'k' })).toBeNull();
    expect(inboxConfig({ VITE_INBOX_URL: 42, VITE_INBOX_KEY: 'k' })).toBeNull();
  });

  it('trims and drops a trailing slash', () => {
    expect(inboxConfig({ VITE_INBOX_URL: ' https://a.test/ ', VITE_INBOX_KEY: ' k ' })).toEqual({
      url: 'https://a.test',
      key: 'k',
    });
  });
});

describe('sendJob', () => {
  it('adds the STL, the picture and the JSON, in that order, with the public key', async () => {
    const { calls, doFetch } = pretend(() => ok());
    expect(await sendJob(config, job(), doFetch)).toBe('sent');
    expect(calls.map((c) => c.path)).toEqual([
      '/storage/v1/object/puzzles/6a/6A Big Cat.stl',
      '/storage/v1/object/puzzles/6a/6A Big Cat.png',
      '/storage/v1/object/puzzles/6a/6A Big Cat.json',
    ]);
    expect(calls.map((c) => c.type)).toEqual(['model/stl', 'image/png', 'application/json']);
    expect(calls.map((c) => c.size)).toEqual([3, 2, 7]);
    for (const c of calls) {
      expect(c.apikey).toBe('public-key');
      expect(c.auth).toBe('Bearer public-key');
      expect(c.path.replace('/storage/v1/object/puzzles/', '')).toMatch(INBOX_KEY_PATTERN);
    }
  });

  it('only sends to the inbox address', async () => {
    const seen: string[] = [];
    const doFetch = (async (url: string | URL | Request) => {
      seen.push(String(url));
      return ok();
    }) as typeof fetch;
    await sendJob(config, job(), doFetch);
    expect(seen.length).toBe(3);
    for (const u of seen) expect(u.startsWith('https://inbox.example.test/storage/v1/')).toBe(true);
  });

  it('moves the whole set to "(2)" when the name is taken', async () => {
    const { calls, doFetch } = pretend((c) =>
      c.path.endsWith('6A Big Cat.stl') ? refuse('KeyAlreadyExists') : ok(),
    );
    expect(await sendJob(config, job(), doFetch)).toBe('sent');
    expect(calls.map((c) => c.path.split('/').pop())).toEqual([
      '6A Big Cat.stl',
      '6A Big Cat (2).stl',
      '6A Big Cat (2).png',
      '6A Big Cat (2).json',
    ]);
  });

  it('keeps counting up while names are taken, then gives up', async () => {
    const { calls, doFetch } = pretend(() => refuse('KeyAlreadyExists'));
    expect(await sendJob(config, job(), doFetch)).toBe('error');
    expect(calls.length).toBe(20);
  });

  it('counts a name already taken for the picture or JSON as sent (the set is already there)', async () => {
    const { doFetch } = pretend((c) =>
      c.path.endsWith('.png') ? refuse('KeyAlreadyExists') : ok(),
    );
    const j = job();
    expect(await sendJob(config, j, doFetch)).toBe('sent');
    expect(j.files.every((f) => f.done)).toBe(true);
  });

  it('says offline when there is no connection, and a second try carries on', async () => {
    const down = pretend((_c, n) => (n === 2 ? new Error('network') : ok()));
    const j = job();
    expect(await sendJob(config, j, down.doFetch)).toBe('offline');
    expect(j.files.map((f) => f.done)).toEqual([true, false, false]);

    const up = pretend(() => ok());
    expect(await sendJob(config, j, up.doFetch)).toBe('sent');
    // The STL already went, so only the picture and the JSON are sent now.
    expect(up.calls.map((c) => c.path.split('.').pop())).toEqual(['png', 'json']);
  });

  it('names the reason when the inbox refuses', async () => {
    expect(await sendJob(config, job(), pretend(() => refuse('EntityTooLarge')).doFetch)).toBe(
      'too-big',
    );
    expect(await sendJob(config, job(), pretend(() => refuse('AccessDenied')).doFetch)).toBe(
      'refused',
    );
    expect(await sendJob(config, job(), pretend(() => refuse('InvalidKey')).doFetch)).toBe(
      'refused',
    );
    expect(await sendJob(config, job(), pretend(() => refuse('Other')).doFetch)).toBe('error');
    expect(
      await sendJob(config, job(), pretend(() => new Response('oops', { status: 500 })).doFetch),
    ).toBe('error');
  });
});
