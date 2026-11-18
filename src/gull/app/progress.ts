/** Campaign progress, kept in the browser (localStorage). */

export interface Progress {
  /** Operations finished (the next one unlocks). */
  done: string[];
  best: Record<string, { total: number; grade: string }>;
}

const KEY = 'gull-britannia.progress';

export function loadProgress(): Progress {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Progress> | null;
    return { done: Array.isArray(raw?.done) ? raw!.done.filter((x) => typeof x === 'string') : [], best: raw?.best && typeof raw.best === 'object' ? raw.best : {} };
  } catch {
    return { done: [], best: {} };
  }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private window */
  }
}
