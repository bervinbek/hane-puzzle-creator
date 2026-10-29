import { describe, expect, it } from 'vitest';
import { MAX_BATCH } from '../core/export/batch';
import { serializeProject, type Project } from '../core/project';
import { DEFAULT_TEACHER } from '../core/puzzle/settings';
import { parseBatch } from './batch';

const project = (name: string): Project => ({
  outline: [
    [-40, -20],
    [40, -20],
    [40, 20],
    [-40, 20],
  ],
  pieces: 6,
  seed: 1,
  name,
  settings: DEFAULT_TEACHER,
});

const stored = (projects: Project[]): string =>
  JSON.stringify(projects.map((p) => JSON.parse(serializeProject(p))));

describe('parseBatch', () => {
  it('is empty for nothing, junk or the wrong kind of thing', () => {
    for (const raw of [null, '', 'not json', '5', '{}', 'null'])
      expect(parseBatch(raw)).toEqual([]);
  });

  it('brings back what was stored, in order', () => {
    const list = parseBatch(stored([project('fish'), project('dog')]));
    expect(list.map((p) => p.name)).toEqual(['fish', 'dog']);
  });

  it('drops entries that are not valid projects and keeps the good ones', () => {
    const good = JSON.parse(serializeProject(project('cat')));
    const raw = JSON.stringify([{ app: 'other' }, good, 7, null, { ...good, pieces: 0 }]);
    expect(parseBatch(raw).map((p) => p.name)).toEqual(['cat']);
  });

  it('never holds more than a batch can', () => {
    const many = Array.from({ length: MAX_BATCH + 5 }, () => project('tan'));
    expect(parseBatch(stored(many))).toHaveLength(MAX_BATCH);
  });
});
