// Opérations pures sur la liste des points. Les points ne se chevauchent jamais dans le rush :
// une seule piste, et un montage qu'on peut réécrire en vérité terrain sans conflit.

import { type Clip, newId } from "./edit";

export const MIN_CLIP_MS = 400;
export const NEW_CLIP_MS = 8000;

export interface Limits {
  lo: number;
  hi: number;
}

/** Espace libre autour d'un point : fin du voisin d'avant, début du voisin d'après. */
export function limitsFor(clips: Clip[], id: string, durationMs: number | null): Limits {
  const me = clips.find((c) => c.id === id);
  let lo = 0;
  let hi = durationMs ?? Number.POSITIVE_INFINITY;
  if (!me) return { lo, hi };
  for (const c of clips) {
    if (c.id === id) continue;
    if (c.end <= me.start + 1 && c.end > lo) lo = c.end;
    if (c.start >= me.end - 1 && c.start < hi) hi = c.start;
  }
  return { lo, hi };
}

const replace = (clips: Clip[], id: string, f: (c: Clip) => Clip | Clip[] | null): Clip[] =>
  clips.flatMap((c) => {
    if (c.id !== id) return [c];
    const r = f(c);
    return r === null ? [] : Array.isArray(r) ? r : [r];
  });

export type Edge = "start" | "end";

export function trim(clips: Clip[], id: string, edge: Edge, t: number, durationMs: number | null): Clip[] {
  const { lo, hi } = limitsFor(clips, id, durationMs);
  return replace(clips, id, (c) => {
    if (edge === "start") {
      const start = Math.round(Math.min(Math.max(t, lo), c.end - MIN_CLIP_MS));
      return start === c.start ? c : { ...c, start };
    }
    const end = Math.round(Math.max(Math.min(t, hi), c.start + MIN_CLIP_MS));
    return end === c.end ? c : { ...c, end };
  });
}

/** Glisse un point dans le rush en gardant sa durée, sans passer par-dessus ses voisins. */
export function slide(clips: Clip[], id: string, start: number, durationMs: number | null): Clip[] {
  const { lo, hi } = limitsFor(clips, id, durationMs);
  return replace(clips, id, (c) => {
    const len = c.end - c.start;
    const s = Math.round(Math.min(Math.max(start, lo), hi - len));
    if (s === c.start || s < lo) return c;
    const delta = s - c.start;
    return { ...c, start: s, end: s + len, hits: c.hits.map((h) => h + delta) };
  });
}

/** Coupe un point en deux à l'instant `at`. Les deux moitiés se suivent dans le montage. */
export function split(clips: Clip[], id: string, at: number): { clips: Clip[]; second: string | null } {
  const c = clips.find((x) => x.id === id);
  const t = Math.round(at);
  if (!c || t - c.start < MIN_CLIP_MS || c.end - t < MIN_CLIP_MS) return { clips, second: null };
  const b: Clip = { ...c, id: newId(), start: t, hits: c.hits.filter((h) => h >= t) };
  const a: Clip = { ...c, end: t, hits: c.hits.filter((h) => h < t) };
  return { clips: replace(clips, id, () => [a, b]), second: b.id };
}

export function remove(clips: Clip[], id: string): Clip[] {
  return clips.filter((c) => c.id !== id);
}

/**
 * Ajoute un point manuel à `at`, dans l'espace libre qui l'entoure. Il prend place dans le
 * montage juste après le dernier point qui le précède dans le rush.
 */
export function add(
  clips: Clip[],
  at: number,
  durationMs: number | null,
  length = NEW_CLIP_MS,
): { clips: Clip[]; id: string | null } {
  const t = Math.round(at);
  if (clips.some((c) => t >= c.start && t < c.end)) return { clips, id: null };
  let lo = 0;
  let hi = durationMs ?? Number.POSITIVE_INFINITY;
  for (const c of clips) {
    if (c.end <= t && c.end > lo) lo = c.end;
    if (c.start > t && c.start < hi) hi = c.start;
  }
  const end = Math.min(t + length, hi);
  const start = Math.max(lo, Math.min(t, end - MIN_CLIP_MS));
  if (end - start < MIN_CLIP_MS) return { clips, id: null };
  const clip: Clip = { id: newId(), start, end, origin: "manuel", hits: [], keep: true };
  let after = -1;
  clips.forEach((c, i) => {
    if (c.start < start && (after < 0 || c.start > clips[after].start)) after = i;
  });
  const next = [...clips];
  next.splice(after + 1, 0, clip);
  return { clips: next, id: clip.id };
}

export function reorder(clips: Clip[], id: string, toIndex: number): Clip[] {
  const from = clips.findIndex((c) => c.id === id);
  if (from < 0) return clips;
  const to = Math.max(0, Math.min(toIndex, clips.length - 1));
  if (from === to) return clips;
  const next = [...clips];
  const [c] = next.splice(from, 1);
  next.splice(to, 0, c);
  return next;
}

export function sortChronological(clips: Clip[]): Clip[] {
  return [...clips].sort((a, b) => a.start - b.start);
}

export const isChronological = (clips: Clip[]) => clips.every((c, i) => i === 0 || clips[i - 1].start <= c.start);

export function toggleKeep(clips: Clip[], id: string): Clip[] {
  return replace(clips, id, (c) => ({ ...c, keep: !c.keep }));
}

/** Les points qui entrent dans le montage, dans son ordre. */
export const kept = (clips: Clip[]) => clips.filter((c) => c.keep);

export const totalDuration = (clips: Clip[]) => clips.reduce((s, c) => s + (c.end - c.start), 0);

/** Point du rush sous l'instant `t`, s'il y en a un. */
export const clipAt = (clips: Clip[], t: number) => clips.find((c) => t >= c.start && t < c.end) ?? null;
