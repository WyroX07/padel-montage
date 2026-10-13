export type Team = "A" | "B";
export type Player = 0 | 1;

/** Joueur au service : l'équipe et lequel de ses deux joueurs. */
export interface Server {
  team: Team;
  player: Player;
}

/**
 * Règle à 40-40.
 * - `advantage` : avantages sans limite (règle classique).
 * - `golden-point` : punto de oro, le point suivant décide du jeu.
 * - `star-point` : règle FIP 2026, deux avantages se jouent ; à la troisième égalité, un point décisif.
 */
export type DeuceRule = "advantage" | "golden-point" | "star-point";

export interface TeamInfo {
  /** Noms affichés, dans l'ordre de service de l'équipe (joueur 0 puis joueur 1). */
  players: [string, string];
  /** Nom court optionnel (club, surnom d'équipe). */
  name?: string;
}

export interface MatchConfig {
  teams: Record<Team, TeamInfo>;
  /** Nombre de sets maximum : 1, 3 ou 5. */
  bestOf: 1 | 3 | 5;
  /** Jeux pour gagner un set (6 en standard, 4 en format court). */
  gamesPerSet: number;
  deuceRule: DeuceRule;
  /** Tie-break à égalité `gamesPerSet`-`gamesPerSet`. Sinon on joue jusqu'à deux jeux d'écart. */
  tiebreak: boolean;
  tiebreakPoints: number;
  /**
   * À une manche partout : super tie-break à 10 (`super-tiebreak`, défaut), tie-break à 7
   * (`tiebreak`, certains tournois) ou 3e set complet (`full`).
   */
  finalSet: "super-tiebreak" | "tiebreak" | "full";
  superTiebreakPoints: number;
  firstServer: Server;
  /** Pour un rush qui commence en cours de match. */
  start?: MatchStart;
}

export interface MatchStart {
  /** Sets déjà terminés, par exemple `[[6, 4]]`. */
  sets?: Array<[number, number]>;
  /** Jeux du set en cours. */
  games?: [number, number];
  /** Serveur du premier jeu filmé ; par défaut `firstServer`. */
  server?: Server;
}

export const DEFAULT_CONFIG: MatchConfig = {
  teams: {
    A: { players: ["Joueur 1", "Joueur 2"] },
    B: { players: ["Joueur 3", "Joueur 4"] },
  },
  bestOf: 3,
  gamesPerSet: 6,
  deuceRule: "advantage",
  tiebreak: true,
  tiebreakPoints: 7,
  finalSet: "super-tiebreak",
  superTiebreakPoints: 10,
  firstServer: { team: "A", player: 0 },
};

/** Événements qui font avancer le score. `at` est le temps en secondes dans le rush. */
export type ScoreEvent =
  | { kind: "point"; winner: Team; at?: number; id?: string }
  /** Correction manuelle du serveur (changement d'ordre en début de set, oubli). */
  | { kind: "server"; server: Server; at?: number; id?: string };

export interface SetScore {
  A: number;
  B: number;
  /** Points du tie-break qui a décidé le set (ou le match). */
  tiebreak?: { A: number; B: number };
  /** Set décisif remplacé par un tie-break (super ou à 7) : seul `tiebreak` compte. */
  matchTiebreak?: boolean;
}

export interface GameScore {
  A: number;
  B: number;
  /** Nombre de fois où le jeu est revenu à égalité 40-40. */
  deuces: number;
}

export type Phase = "game" | "tiebreak" | "match-tiebreak" | "finished";

export interface MatchState {
  /** Sets terminés. */
  sets: SetScore[];
  /** Jeux du set en cours. */
  games: { A: number; B: number };
  /** Points du jeu ou du tie-break en cours. */
  points: GameScore;
  phase: Phase;
  server: Server;
  /** Joueur qui servira la prochaine fois que chaque équipe prendra le service. */
  nextPlayer: Record<Team, Player>;
  /** Équipe qui a servi le premier point du tie-break en cours. */
  tiebreakFirstServer?: Team;
  winner?: Team;
}

/** Ce qu'un point vient de gagner, pour animer l'overlay. */
export interface Outcome {
  game?: Team;
  set?: Team;
  match?: Team;
  /** Le point a été ignoré car le match était fini. */
  ignored?: boolean;
}

export interface Snapshot {
  /** Index de l'événement dans la liste, -1 pour l'état initial. */
  index: number;
  event?: ScoreEvent;
  state: MatchState;
  outcome: Outcome;
}
