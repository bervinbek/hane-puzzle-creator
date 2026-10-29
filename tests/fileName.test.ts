import { describe, expect, it } from 'vitest';
import { MAX_FILE_NAME_LETTERS, animalFileName } from '../src/core/export/fileName';

describe('animalFileName', () => {
  it('keeps the spelling the student typed', () => {
    expect(animalFileName('Elephant')).toBe('Elephant');
    expect(animalFileName('Big Cat')).toBe('Big Cat');
    expect(animalFileName('mr_fox-2')).toBe('mr_fox-2');
  });

  it('tidies spaces', () => {
    expect(animalFileName('  Big    Cat  ')).toBe('Big Cat');
    expect(animalFileName('Big\tCat\n')).toBe('Big Cat');
  });

  it('takes out what a file name cannot hold', () => {
    expect(animalFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij');
    expect(animalFileName('Fish\u0000\u001f')).toBe('Fish');
  });

  it('does not start or end with dots or spaces', () => {
    expect(animalFileName('..Fish..')).toBe('Fish');
    expect(animalFileName(' . Fish . ')).toBe('Fish');
    expect(animalFileName('Mr. Fox')).toBe('Mr. Fox');
  });

  it('is empty when there is nothing usable: nothing, spaces, dots or symbols', () => {
    for (const raw of ['', '   ', '...', '!!!', '/\\:', '🐘', '- _ -']) {
      expect(animalFileName(raw), JSON.stringify(raw)).toBe('');
    }
  });

  it('works in other languages and with accents', () => {
    expect(animalFileName('大象')).toBe('大象');
    expect(animalFileName('யானை')).toBe('யானை');
    expect(animalFileName('Éléphant')).toBe('Éléphant');
    expect(animalFileName('Слон 2')).toBe('Слон 2');
  });

  it('joins the same letters the same way however they were typed', () => {
    // "e" plus a combining accent and the single letter "é" are one name.
    expect(animalFileName('Café')).toBe(animalFileName('Café'));
  });

  it('keeps an emoji that sits next to letters', () => {
    expect(animalFileName('Cat 🐱')).toBe('Cat 🐱');
  });

  it('cuts a long name to whole characters', () => {
    const long = animalFileName('a'.repeat(200));
    expect(long).toHaveLength(MAX_FILE_NAME_LETTERS);
    // An emoji is two code units: the cut must not leave half of one.
    const emoji = animalFileName('x' + '🐘'.repeat(100));
    expect([...emoji]).toHaveLength(MAX_FILE_NAME_LETTERS);
    expect(emoji).not.toMatch(/[\ud800-\udbff]$/);
    // A cut that lands on a space does not leave it at the end.
    expect(animalFileName('a'.repeat(59) + ' bcd')).toBe('a'.repeat(59));
  });

  it('changes the names Windows keeps for devices, in any case', () => {
    expect(animalFileName('con')).toBe('con puzzle');
    expect(animalFileName('NUL')).toBe('NUL puzzle');
    expect(animalFileName('Com1')).toBe('Com1 puzzle');
    expect(animalFileName('lpt9')).toBe('lpt9 puzzle');
    expect(animalFileName('Console')).toBe('Console');
    expect(animalFileName('com10')).toBe('com10');
  });
});
