import { describe, expect, it } from 'vitest';
import {
  INBOX_KEY_PATTERN,
  MAX_CLASS_CODE_LETTERS,
  classCodeText,
  classFileName,
  classFolder,
  inboxBase,
  inboxJson,
  inboxKey,
  thumbnailLayout,
} from '../src/core/export/classInbox';
import { fitToPlate } from '../src/core/geometry/polyline';
import { DEFAULT_PUZZLE, generatePuzzle } from '../src/core/puzzle/generate';
import { FISH_OUTLINE } from '../src/core/samples/fish';

describe('classFileName', () => {
  it('is the class code, a space, then the animal', () => {
    expect(classFileName('6A', 'Big Cat')).toBe('6A Big Cat');
    expect(classFileName('  Class   3 ', '  Fox ')).toBe('Class 3 Fox');
  });

  it('keeps the spelling in any language', () => {
    expect(classFileName('六年级', '大象')).toBe('六年级 大象');
    expect(classFileName('P4-Émile', 'Éléphant')).toBe('P4-Émile Éléphant');
  });

  it('takes out what a file name cannot hold', () => {
    expect(classFileName('6/A', 'Big:Cat?')).toBe('6A BigCat');
  });

  it('is empty when either part has no letter or number', () => {
    expect(classFileName('', 'Cat')).toBe('');
    expect(classFileName('6A', '')).toBe('');
    expect(classFileName('!!!', 'Cat')).toBe('');
    expect(classFileName('6A', '   ')).toBe('');
  });

  it('cuts a long class code to 20 characters', () => {
    const code = 'a'.repeat(50);
    expect(classCodeText(code)).toBe('a'.repeat(MAX_CLASS_CODE_LETTERS));
  });
});

describe('classFolder', () => {
  it('puts differently typed codes in one folder', () => {
    expect(classFolder('6A')).toBe('6a');
    expect(classFolder('6a')).toBe('6a');
    expect(classFolder(' 6 a ')).toBe('6a');
    expect(classFolder('Class 6-A')).toBe('class6-a');
  });

  it('uses plain letters for accents', () => {
    expect(classFolder('Émile 2')).toBe('emile2');
  });

  it('gives a stable folder to a code in another script', () => {
    const a = classFolder('六年级');
    expect(a).toMatch(/^c-[0-9a-f]{8}$/);
    expect(classFolder('六年级')).toBe(a);
    expect(classFolder('七年级')).not.toBe(a);
  });

  it('is empty for a code that is not usable', () => {
    expect(classFolder('')).toBe('');
    expect(classFolder('???')).toBe('');
    expect(classFolder('---')).toBe('');
  });

  it('never has a slash or a dot, so a code cannot make another path', () => {
    expect(classFolder('../../x')).toBe('x');
    expect(classFolder('a/b')).toBe('ab');
  });
});

describe('inboxBase and inboxKey', () => {
  it('matches the download name when it is plain', () => {
    expect(inboxBase('6A', 'Big Cat')).toBe('6A Big Cat');
  });

  it('turns accents into plain letters', () => {
    expect(inboxBase('6A', 'Éléphant')).toBe('6A Elephant');
  });

  it('uses a fingerprint when nothing plain is left, and keeps it steady', () => {
    const base = inboxBase('6A', '大象');
    expect(base).toMatch(/^6A animal-[0-9a-f]{8}$/);
    expect(inboxBase('6A', '大象')).toBe(base);
    expect(inboxBase('6A', '小猫')).not.toBe(base);
    expect(inboxBase('六年级', 'Cat')).toMatch(/^c-[0-9a-f]{8} Cat$/);
  });

  it('is empty when the code or the animal is not usable', () => {
    expect(inboxBase('', 'Cat')).toBe('');
    expect(inboxBase('6A', '!!')).toBe('');
  });

  it('numbers a name that is already taken', () => {
    expect(inboxKey('6a', '6A Cat', 1, 'stl')).toBe('6a/6A Cat.stl');
    expect(inboxKey('6a', '6A Cat', 2, 'png')).toBe('6a/6A Cat (2).png');
    expect(inboxKey('6a', '6A Cat', 3, 'json')).toBe('6a/6A Cat (3).json');
  });

  it('always makes a key the inbox accepts', () => {
    const codes = ['6A', '六年级', '  Class   3 ', 'É-1', 'x'.repeat(80), 'a.b c'];
    const animals = ['Big Cat', '大象', 'Éléphant', 'y'.repeat(200), 'mr_fox-2', '(1)', 'a  b'];
    for (const c of codes) {
      for (const a of animals) {
        const folder = classFolder(c);
        const base = inboxBase(c, a);
        expect(folder, `${c} / ${a}`).not.toBe('');
        for (const copy of [1, 2, 9]) {
          for (const ext of ['stl', 'png', 'json'] as const) {
            expect(inboxKey(folder, base, copy, ext), `${c} / ${a}`).toMatch(INBOX_KEY_PATTERN);
          }
        }
      }
    }
  });

  it('refuses keys the inbox would not take', () => {
    expect(INBOX_KEY_PATTERN.test('6a/大象.stl')).toBe(false);
    expect(INBOX_KEY_PATTERN.test('6A/cat.stl')).toBe(false);
    expect(INBOX_KEY_PATTERN.test('6a/sub/cat.stl')).toBe(false);
    expect(INBOX_KEY_PATTERN.test('cat.stl')).toBe(false);
    expect(INBOX_KEY_PATTERN.test('6a/cat.exe')).toBe(false);
  });
});

describe('inboxJson', () => {
  it('holds fixed fields only', () => {
    const text = inboxJson({
      classCode: '六年级',
      animal: '大象',
      fileName: '六年级 大象.stl',
      pieces: 12,
      seed: 3,
      gapMm: 0.3,
      createdAt: '2026-10-30T10:00:00.000Z',
      // Anything extra a caller might add is not written.
      ...({ photo: 'data:image/png;base64,AAAA' } as object),
    });
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(
      [
        'animal',
        'app',
        'classCode',
        'createdAt',
        'fileName',
        'gapMm',
        'pieces',
        'seed',
        'version',
      ].sort(),
    );
    expect(parsed.animal).toBe('大象');
    expect(text).not.toContain('data:image');
  });
});

describe('thumbnailLayout', () => {
  const outline = fitToPlate([...FISH_OUTLINE], DEFAULT_PUZZLE.plateSize).points;
  const puzzle = generatePuzzle(outline, { ...DEFAULT_PUZZLE, count: 8, seed: 1 });

  it('fits the longest side to the size and keeps the shape', () => {
    const l = thumbnailLayout(puzzle, 512, 16);
    expect(Math.max(l.width, l.height)).toBeLessThanOrEqual(512);
    expect(Math.max(l.width, l.height)).toBeGreaterThanOrEqual(510);
    expect(l.scale).toBeGreaterThan(0);
  });

  it('puts every corner of every piece inside the picture', () => {
    const l = thumbnailLayout(puzzle, 512, 16);
    for (const piece of puzzle.pieces) {
      for (const [x, y] of piece.polygon) {
        const px = (x - l.minX) * l.scale + l.margin;
        const py = (l.maxY - y) * l.scale + l.margin;
        expect(px).toBeGreaterThanOrEqual(l.margin - 1e-6);
        expect(px).toBeLessThanOrEqual(l.width - l.margin + 1);
        expect(py).toBeGreaterThanOrEqual(l.margin - 1e-6);
        expect(py).toBeLessThanOrEqual(l.height - l.margin + 1);
      }
    }
  });

  it('gives the same answer twice', () => {
    expect(thumbnailLayout(puzzle)).toEqual(thumbnailLayout(puzzle));
  });
});
