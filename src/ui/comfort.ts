export type TextSize = 'small' | 'medium' | 'large';

/** Sensory and reading preferences. See docs/DESIGN.md section 9. */
export interface Comfort {
  calm: boolean;
  reduceMotion: boolean;
  textSize: TextSize;
}

const STORAGE_KEY = 'hane.comfort.v1';
const TEXT_SIZES: readonly TextSize[] = ['small', 'medium', 'large'];

export function defaultComfort(prefersReducedMotion: boolean): Comfort {
  return { calm: false, reduceMotion: prefersReducedMotion, textSize: 'large' };
}

/** Parses stored JSON; anything missing or invalid falls back to the defaults. */
export function parseComfort(raw: string | null, prefersReducedMotion: boolean): Comfort {
  const base = defaultComfort(prefersReducedMotion);
  if (!raw) return base;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return base;
    const d = data as Record<string, unknown>;
    return {
      calm: typeof d.calm === 'boolean' ? d.calm : base.calm,
      reduceMotion: typeof d.reduceMotion === 'boolean' ? d.reduceMotion : base.reduceMotion,
      textSize: TEXT_SIZES.includes(d.textSize as TextSize)
        ? (d.textSize as TextSize)
        : base.textSize,
    };
  } catch {
    return base;
  }
}

export function loadComfort(): Comfort {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    return parseComfort(localStorage.getItem(STORAGE_KEY), prefersReduced);
  } catch {
    return defaultComfort(prefersReduced);
  }
}

export function saveComfort(comfort: Comfort): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(comfort));
  } catch {
    // Storage can be blocked (private windows); preferences then last for this visit only.
  }
}

/** Reflects the settings on <html> so CSS can react to them. */
export function applyComfort(comfort: Comfort, root: HTMLElement = document.documentElement): void {
  root.dataset.calm = String(comfort.calm);
  root.dataset.reduceMotion = String(comfort.reduceMotion);
  root.dataset.textSize = comfort.textSize;
}
