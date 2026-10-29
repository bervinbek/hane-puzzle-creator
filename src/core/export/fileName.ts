/** The most letters a saved file name keeps (counted as whole characters, not code units). */
export const MAX_FILE_NAME_LETTERS = 60;

/** What no file system accepts in a name, plus control characters. */
const NOT_ALLOWED = /[\\/:*?"<>|\p{Cc}]/gu;

/** Windows keeps these for devices, with or without an extension. */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * The file name (without ".stl") for a puzzle, from what the student typed for the animal.
 *
 * The spelling is kept, in any language; only what a file name cannot hold is taken out, spaces
 * are tidied, and the name is cut to a sensible length. It comes back empty when there is no
 * letter or number left (only spaces or symbols), which means "ask for a name".
 */
export function animalFileName(raw: string): string {
  const tidy = (text: string): string =>
    text
      // Tabs and line breaks are spaces first, so they separate words instead of joining them.
      .replace(/\s+/g, ' ')
      .replace(NOT_ALLOWED, '')
      .replace(/ {2,}/g, ' ')
      .replace(/^[ .]+|[ .]+$/g, '');

  let name = tidy(raw.normalize('NFC'));
  if (!/[\p{L}\p{N}]/u.test(name)) return '';
  // Count whole characters so a pair like an emoji is never cut in half.
  name = tidy([...name].slice(0, MAX_FILE_NAME_LETTERS).join(''));
  if (!/[\p{L}\p{N}]/u.test(name)) return '';
  return RESERVED.test(name) ? `${name} puzzle` : name;
}
