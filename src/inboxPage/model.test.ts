import { describe, expect, it } from 'vitest';
import { inboxApi } from './api';
import {
  animalTitle,
  chunks,
  confirmMatches,
  deleteProblem,
  parseMeta,
  safeFileName,
  totalFiles,
  waitText,
  zipNames,
  type Animal,
} from './model';

const animal = (
  base: string,
  exts: ('stl' | 'png' | 'json')[] = ['stl', 'png', 'json'],
): Animal => ({
  base,
  files: Object.fromEntries(exts.map((e) => [e, { size: 1 }])),
  createdAt: '2026-10-30T10:00:00Z',
});

describe('the animal JSON from a student', () => {
  it('keeps the exact words and the piece count', () => {
    const meta = parseMeta(
      JSON.stringify({
        classCode: '六年级',
        animal: '大象',
        fileName: '六年级 大象.stl',
        pieces: 12,
        createdAt: '2026-10-30T10:00:00Z',
      }),
    );
    expect(meta).toEqual({
      classCode: '六年级',
      animal: '大象',
      fileName: '六年级 大象.stl',
      pieces: 12,
      createdAt: '2026-10-30T10:00:00Z',
    });
    expect(animalTitle(animal('6A animal-1a2b3c4d'), meta)).toBe('六年级 大象');
  });

  it.each([
    '',
    'not json',
    'null',
    '[]',
    '5',
    '{"pieces":"12","animal":5,"createdAt":"tomorrow"}',
    '{"pieces":-3}',
    '{"pieces":99999}',
  ])('turns %j into empty values instead of an error', (text) => {
    expect(parseMeta(text)).toEqual({
      classCode: null,
      animal: null,
      fileName: null,
      pieces: null,
      createdAt: null,
    });
  });

  it('cuts very long text and falls back to the file name for a title', () => {
    const meta = parseMeta(JSON.stringify({ classCode: 'x'.repeat(500), animal: 'y'.repeat(500) }));
    expect(meta.classCode).toHaveLength(40);
    expect(meta.animal).toHaveLength(60);
    expect(animalTitle(animal('6A Cat'), undefined)).toBe('6A Cat');
    expect(animalTitle(animal('6A Cat'), parseMeta('{}'))).toBe('6A Cat');
  });

  it('keeps markup as plain text (the page only ever uses textContent)', () => {
    const meta = parseMeta(
      JSON.stringify({ classCode: '6A', animal: '<img src=x onerror=alert(1)>' }),
    );
    expect(meta.animal).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('file names for a ZIP', () => {
  it('makes names safe and never repeats one', () => {
    expect(zipNames(['6A Big Cat', '6a big cat', '6A Big Cat', 'a/b\\c:d*e?"f<g>h|i'])).toEqual([
      '6A Big Cat.stl',
      '6a big cat (2).stl',
      '6A Big Cat (3).stl',
      'abcdefghi.stl',
    ]);
    expect(safeFileName('..\u0000hidden\n name')).toBe('hidden name');
    expect(safeFileName('///')).toBe('puzzle');
    expect(safeFileName('大象')).toBe('大象');
    expect(safeFileName('x'.repeat(300))).toHaveLength(120);
  });
});

describe('counts and words', () => {
  it('counts the files a class delete promises to remove', () => {
    expect(totalFiles([animal('a'), animal('b', ['stl'])])).toBe(4);
    expect(totalFiles([])).toBe(0);
  });

  it('accepts the typed class name in any case, but not another one', () => {
    expect(confirmMatches(' 6A ', '6a')).toBe(true);
    expect(confirmMatches('6', '6a')).toBe(false);
    expect(confirmMatches('', '6a')).toBe(false);
  });

  it('says how long to wait', () => {
    expect(waitText(30)).toBe('30 seconds');
    expect(waitText(60)).toBe('1 minute');
    expect(waitText(61)).toBe('2 minutes');
    expect(waitText(900)).toBe('15 minutes');
  });

  it('explains every refusal and always says nothing was deleted', () => {
    for (const status of [401, 429, 503, 409, 0, 500]) {
      expect(deleteProblem(status, { retryAfterSeconds: 120 })).toMatch(/Nothing was deleted/);
    }
    expect(deleteProblem(429, { retryAfterSeconds: 120 })).toContain('2 minutes');
    expect(deleteProblem(429, null)).toContain('15 minutes');
  });

  it('splits lists', () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunks([], 3)).toEqual([]);
  });
});

describe('the inbox client', () => {
  const config = { url: 'https://proj.example.test', key: 'public-key' };
  const respond = (status: number, body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it('sends the public key in both headers and the passcode only with a delete', async () => {
    const seen: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] =
      [];
    const doFetch = (async (url: string, init: RequestInit) => {
      seen.push({
        url,
        headers: init.headers as Record<string, string>,
        body: JSON.parse(String(init.body)),
      });
      return new Response(JSON.stringify({ folders: [], animals: [], urls: {}, deleted: 3 }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const api = inboxApi(config, doFetch);
    await api.folders();
    await api.animals('6a');
    await api.sign(['6a/x.stl']);
    await api.deleteAnimal('6a', '6A Cat', 'pass phrase');
    await api.deleteClass('6a', 9, 'pass phrase');
    for (const s of seen) {
      expect(s.url).toBe('https://proj.example.test/functions/v1/inbox-admin');
      expect(s.headers).toMatchObject({ apikey: 'public-key', Authorization: 'Bearer public-key' });
    }
    expect(seen.map((s) => 'passcode' in s.body)).toEqual([false, false, false, true, true]);
    expect(seen[3]!.body).toMatchObject({
      action: 'delete',
      folder: '6a',
      base: '6A Cat',
      confirm: '6a',
    });
    expect(seen[4]!.body).toMatchObject({
      action: 'delete',
      folder: '6a',
      expected: 9,
      confirm: '6a',
    });
    expect('base' in seen[4]!.body).toBe(false);
  });

  it('follows only links that point into this inbox', async () => {
    const api = inboxApi(
      config,
      respond(200, {
        urls: {
          'a/ok.png': 'https://proj.example.test/storage/v1/object/sign/puzzles/a/ok.png?token=1',
          'a/bad.png': 'https://evil.example.test/steal',
          'a/worse.png': 'https://proj.example.test.evil.example/x',
          'a/num.png': 5,
        },
      }),
    );
    expect(Object.keys(await api.sign(['a/ok.png']))).toEqual(['a/ok.png']);
  });

  it('hands back the status of a refused delete, and 0 when the inbox cannot be reached', async () => {
    expect(
      await inboxApi(config, respond(429, { retryAfterSeconds: 42 })).deleteClass('6a', 1, 'p'),
    ).toEqual({
      status: 429,
      data: { retryAfterSeconds: 42 },
    });
    const down = (async () => {
      throw new TypeError('network');
    }) as unknown as typeof fetch;
    expect(await inboxApi(config, down).deleteAnimal('6a', 'x', 'p')).toEqual({
      status: 0,
      data: null,
    });
    await expect(inboxApi(config, down).folders()).rejects.toThrow();
  });

  it('keeps only well-formed animals, and only the three known file kinds', async () => {
    const api = inboxApi(
      config,
      respond(200, {
        animals: [
          {
            base: '6A Cat',
            files: { stl: { size: 5 }, png: {}, exe: {} },
            createdAt: '2026-10-30T10:00:00Z',
          },
          { base: 5, files: {} },
          { base: 'x', files: null },
          null,
        ],
      }),
    );
    expect(await api.animals('6a')).toEqual([
      {
        base: '6A Cat',
        files: { stl: { size: 0 }, png: { size: 0 } },
        createdAt: '2026-10-30T10:00:00Z',
      },
    ]);
  });

  it('ignores rows that are not what was promised', async () => {
    const api = inboxApi(
      config,
      respond(200, { folders: [{ folder: '6a', animals: 2 }, { folder: 5 }, null, 'x'] }),
    );
    expect(await api.folders()).toEqual([{ folder: '6a', animals: 2 }]);
  });
});
