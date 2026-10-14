import { type MatchConfig, type Snapshot, view } from "@padel/score";

/** Une image d'overlay distincte, et les instantanés qui l'affichent. */
export interface OverlayFrame {
  /** Identique pour deux instantanés qui donnent exactement le même overlay. */
  key: string;
  snapshot: Snapshot;
  /** Index dans le tableau d'instantanés reçu. */
  indexes: number[];
}

/**
 * Regroupe les instantanés qui donnent le même overlay, pour ne rendre qu'une image par état
 * (une centaine par match). L'ordre suit la première apparition.
 */
export function overlayFrames(config: MatchConfig, snapshots: readonly Snapshot[]): OverlayFrame[] {
  const byKey = new Map<string, OverlayFrame>();
  snapshots.forEach((snapshot, i) => {
    const { set, match } = snapshot.outcome;
    const key = JSON.stringify([view(config, snapshot.state), set ?? null, match ?? null]);
    const frame = byKey.get(key);
    if (frame) frame.indexes.push(i);
    else byKey.set(key, { key, snapshot, indexes: [i] });
  });
  return [...byKey.values()];
}
