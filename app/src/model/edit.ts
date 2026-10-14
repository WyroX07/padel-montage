// Formats lus et écrits par l'appli.
// - padel-rallies/v1 : sortie du détecteur et vérité terrain (engine/src/padel_engine/annotations.py).
//   L'appli ne connaît que ce fichier, jamais les modules de détection.
// - padel-edit/v1 : le montage de l'utilisateur, enregistré à côté du rush.

export const RALLIES_FORMAT = "padel-rallies/v1";
export const EDIT_FORMAT = "padel-edit/v1";

export type Origin = "detection" | "manuel";

export interface Clip {
  id: string;
  /** Début et fin dans le rush, en millisecondes. */
  start: number;
  end: number;
  origin: Origin;
  /** Coups détectés (ms dans le rush), affichés comme repères et points d'aimantation. */
  hits: number[];
  confidence?: number;
  /**
   * false : vrai point, mais sans intérêt. Il reste sur la timeline (le score le compte),
   * il n'entre pas dans le montage. Même sens que `keep` dans padel-rallies/v1.
   */
  keep: boolean;
}

export interface EditDoc {
  format: typeof EDIT_FORMAT;
  video: string;
  duration_ms: number | null;
  camera: string;
  /** Fichier de segments d'où viennent les points détectés. */
  source?: string;
  /** Ordre du montage : l'ordre de ce tableau. */
  clips: Clip[];
}

export interface RallyJson {
  start_ms: number;
  end_ms: number;
  hits?: number[];
  serve_ms?: number;
  confidence?: number;
  keep?: boolean;
}

export interface RallySetJson {
  format: typeof RALLIES_FORMAT;
  video: string;
  camera: string;
  duration_ms: number | null;
  source: "ground_truth" | "prediction";
  rallies: RallyJson[];
  reviewed_until_ms?: number;
}

export class FormatError extends Error {}

let seq = 0;
export function newId(): string {
  seq += 1;
  return `c${Date.now().toString(36)}${seq.toString(36)}`;
}

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

export function clipsFromRallies(set: RallySetJson): Clip[] {
  return [...set.rallies]
    .filter((r) => isNum(r.start_ms) && isNum(r.end_ms) && r.end_ms > r.start_ms)
    .sort((a, b) => a.start_ms - b.start_ms)
    .map((r) => ({
      id: newId(),
      start: Math.round(r.start_ms),
      end: Math.round(r.end_ms),
      origin: "detection" as const,
      hits: (r.hits ?? []).filter(isNum).map(Math.round),
      keep: r.keep !== false,
      ...(isNum(r.confidence) ? { confidence: r.confidence } : {}),
    }));
}

/** Lit un fichier JSON : un montage padel-edit/v1 ou des segments padel-rallies/v1. */
export function parseDocument(text: string, fallbackVideo: string): EditDoc {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new FormatError("Ce fichier n'est pas un JSON valide.");
  }
  if (!data || typeof data !== "object") throw new FormatError("Fichier vide ou illisible.");
  const d = data as Record<string, unknown>;
  if (d.format === EDIT_FORMAT) {
    if (!Array.isArray(d.clips)) throw new FormatError("Montage sans liste de points.");
    const clips: Clip[] = (d.clips as Partial<Clip>[])
      .filter((c) => isNum(c.start) && isNum(c.end) && c.end > c.start)
      .map((c) => ({
        id: typeof c.id === "string" ? c.id : newId(),
        start: Math.round(c.start as number),
        end: Math.round(c.end as number),
        origin: c.origin === "manuel" ? "manuel" : "detection",
        hits: Array.isArray(c.hits) ? c.hits.filter(isNum) : [],
        keep: c.keep !== false,
        ...(isNum(c.confidence) ? { confidence: c.confidence } : {}),
      }));
    return {
      format: EDIT_FORMAT,
      video: typeof d.video === "string" ? d.video : fallbackVideo,
      duration_ms: isNum(d.duration_ms) ? d.duration_ms : null,
      camera: typeof d.camera === "string" ? d.camera : "autre",
      ...(typeof d.source === "string" ? { source: d.source } : {}),
      clips,
    };
  }
  if (d.format === RALLIES_FORMAT) {
    if (!Array.isArray(d.rallies)) throw new FormatError("Fichier de segments sans liste de points.");
    const set = d as unknown as RallySetJson;
    return {
      format: EDIT_FORMAT,
      video: typeof set.video === "string" ? set.video : fallbackVideo,
      duration_ms: isNum(set.duration_ms) ? set.duration_ms : null,
      camera: typeof set.camera === "string" ? set.camera : "autre",
      clips: clipsFromRallies(set),
    };
  }
  throw new FormatError(
    `Format inconnu (${String(d.format ?? "absent")}). Attendu ${RALLIES_FORMAT} ou ${EDIT_FORMAT}.`,
  );
}

export function emptyDoc(video: string, durationMs: number | null): EditDoc {
  return { format: EDIT_FORMAT, video, duration_ms: durationMs, camera: "autre", clips: [] };
}

export function serializeEdit(doc: EditDoc): string {
  const clips = doc.clips.map((c) => ({
    id: c.id,
    start: c.start,
    end: c.end,
    origin: c.origin,
    hits: c.hits,
    ...(c.confidence !== undefined ? { confidence: c.confidence } : {}),
    ...(c.keep ? {} : { keep: false }),
  }));
  return `${JSON.stringify({ ...doc, clips }, null, 2)}\n`;
}

/**
 * Le montage corrigé, réécrit en vérité terrain : ce que l'utilisateur garde devient
 * une annotation que `padel-engine eval` sait lire.
 */
export function toGroundTruth(doc: EditDoc): RallySetJson {
  const sorted = [...doc.clips].sort((a, b) => a.start - b.start);
  return {
    format: RALLIES_FORMAT,
    video: doc.video,
    camera: doc.camera,
    duration_ms: doc.duration_ms,
    source: "ground_truth",
    rallies: sorted.map((c) => ({
      start_ms: c.start,
      end_ms: c.end,
      hits: c.hits.filter((h) => h >= c.start - 500 && h <= c.end + 500),
      ...(c.keep ? {} : { keep: false }),
    })),
  };
}
