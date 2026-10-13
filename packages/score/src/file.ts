import { DEFAULT_CONFIG, type MatchConfig, type ScoreEvent } from "./types";

export const SCORE_FORMAT = "padel-score/v1";

/**
 * Fichier de score d'un rush : la configuration du match et la liste des points.
 * C'est la seule chose à sauvegarder ; l'état s'obtient toujours en rejouant les événements,
 * donc annuler un point revient à le retirer de la liste.
 */
export interface ScoreFile {
  format: typeof SCORE_FORMAT;
  config: MatchConfig;
  events: ScoreEvent[];
}

export function createScoreFile(config: Partial<MatchConfig> = {}): ScoreFile {
  return { format: SCORE_FORMAT, config: { ...DEFAULT_CONFIG, ...config }, events: [] };
}

const isTeam = (v: unknown): v is "A" | "B" => v === "A" || v === "B";
const isPlayer = (v: unknown): v is 0 | 1 => v === 0 || v === 1;

/** Lit un fichier `padel-score/v1` et lève une erreur en français s'il est invalide. */
export function parseScoreFile(json: string): ScoreFile {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("Le fichier de score n'est pas du JSON valide.");
  }
  const file = data as Partial<ScoreFile>;
  if (file?.format !== SCORE_FORMAT) {
    throw new Error(`Format de score inconnu : attendu « ${SCORE_FORMAT} ».`);
  }
  const config: MatchConfig = { ...DEFAULT_CONFIG, ...(file.config ?? {}) };
  if (![1, 3, 5].includes(config.bestOf)) throw new Error("Le nombre de sets doit être 1, 3 ou 5.");
  if (!isTeam(config.firstServer?.team) || !isPlayer(config.firstServer?.player)) {
    throw new Error("Le premier serveur est invalide.");
  }
  const events = Array.isArray(file.events) ? file.events : [];
  events.forEach((e, i) => {
    const ok =
      (e?.kind === "point" && isTeam(e.winner)) ||
      (e?.kind === "server" && isTeam(e.server?.team) && isPlayer(e.server?.player));
    if (!ok) throw new Error(`Événement n° ${i + 1} invalide.`);
    if (e.at !== undefined && typeof e.at !== "number") {
      throw new Error(`Événement n° ${i + 1} : le temps doit être un nombre de secondes.`);
    }
  });
  return { format: SCORE_FORMAT, config, events };
}

/** Trie les événements par temps (stable), comme l'attend `snapshotAt`. */
export function sortEvents(events: readonly ScoreEvent[]): ScoreEvent[] {
  return events
    .map((e, i) => ({ e, i }))
    .sort((x, y) => (x.e.at ?? -Infinity) - (y.e.at ?? -Infinity) || x.i - y.i)
    .map(({ e }) => e);
}
