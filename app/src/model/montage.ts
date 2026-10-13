// Correspondance entre le temps du montage (points mis bout à bout, dans l'ordre choisi)
// et le temps du rush.

import type { Clip } from "./edit";

export interface MontagePos {
  index: number;
  /** Temps dans le rush. */
  t: number;
}

/** Position dans le montage d'un instant du rush, ou null s'il tombe entre deux points. */
export function toMontage(clips: Clip[], t: number, hintIndex?: number): number | null {
  const offsets = startOffsets(clips);
  const inside = (i: number) => t >= clips[i].start && t <= clips[i].end;
  if (hintIndex !== undefined && clips[hintIndex] && inside(hintIndex)) {
    return offsets[hintIndex] + (t - clips[hintIndex].start);
  }
  const i = clips.findIndex((_, k) => inside(k));
  return i < 0 ? null : offsets[i] + (t - clips[i].start);
}

/** Début de chaque point dans le montage. */
export function startOffsets(clips: Clip[]): number[] {
  let acc = 0;
  return clips.map((c) => {
    const o = acc;
    acc += c.end - c.start;
    return o;
  });
}

export function fromMontage(clips: Clip[], m: number): MontagePos | null {
  if (!clips.length) return null;
  let acc = 0;
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    const len = c.end - c.start;
    if (m < acc + len) return { index: i, t: c.start + Math.max(0, m - acc) };
    acc += len;
  }
  const last = clips[clips.length - 1];
  return { index: clips.length - 1, t: last.end };
}

/**
 * Où doit aller la lecture du montage quand la vidéo est à `t` en lisant le point `index` :
 * null tant qu'on reste dedans, sinon le point suivant (ou la fin).
 */
export function advance(clips: Clip[], index: number, t: number): { index: number; t: number } | "end" | null {
  const c = clips[index];
  if (!c) return "end";
  if (t < c.end && t >= c.start - 50) return null;
  const next = clips[index + 1];
  return next ? { index: index + 1, t: next.start } : "end";
}
