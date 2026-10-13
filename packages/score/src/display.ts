import { applyEvent, decidingDeuce, other } from "./engine";
import type { MatchConfig, MatchState, Team } from "./types";

const LABELS = ["0", "15", "30", "40"] as const;

/** Moment particulier du point à jouer, du plus important au moins important. */
export type Stake = "match" | "set" | "break";

export interface ScoreView {
  /** Libellés des points : "0", "15", "30", "40", "AV", "" (adversaire en avantage), ou chiffres en tie-break. */
  points: Record<Team, string>;
  /** Jeux du set en cours. */
  games: Record<Team, number>;
  /** Sets terminés (avec le score du tie-break en petit s'il y en a eu). */
  sets: Array<{ A: number; B: number; tiebreak?: { A: number; B: number }; matchTiebreak?: boolean }>;
  phase: MatchState["phase"];
  serving: MatchState["server"];
  /** 40-40 avec avantages. */
  deuce: boolean;
  /** Le point à jouer décide du jeu : punto de oro ou star point. */
  decidingPoint?: "golden-point" | "star-point";
  /** Balle de break, de set ou de match pour une équipe. */
  stake?: { team: Team; kind: Stake };
  winner?: Team;
}

function stakeFor(config: MatchConfig, state: MatchState, team: Team): Stake | undefined {
  const { outcome } = applyEvent(config, state, { kind: "point", winner: team });
  if (outcome.match) return "match";
  if (outcome.set) return "set";
  if (outcome.game && state.phase === "game" && state.server.team !== team) return "break";
  return undefined;
}

/** Ce que l'overlay doit afficher pour un état donné. */
export function view(config: MatchConfig, state: MatchState): ScoreView {
  const p = state.points;
  const inGame = state.phase === "game";
  const deciding = inGame && p.A === 3 && p.B === 3 && p.deuces >= decidingDeuce(config);

  let points: Record<Team, string>;
  if (!inGame) {
    points = state.phase === "finished" ? { A: "", B: "" } : { A: String(p.A), B: String(p.B) };
  } else if (p.A >= 3 && p.B >= 3) {
    const lead = p.A - p.B;
    points = lead === 0 ? { A: "40", B: "40" } : lead > 0 ? { A: "AV", B: "" } : { A: "", B: "AV" };
  } else {
    points = { A: LABELS[p.A] ?? "40", B: LABELS[p.B] ?? "40" };
  }

  let stake: ScoreView["stake"];
  if (state.phase !== "finished") {
    // Sur un point décisif, les deux équipes peuvent avoir une balle : on garde la plus importante,
    // et celle du receveur à importance égale.
    const rank: Record<Stake, number> = { match: 3, set: 2, break: 1 };
    for (const team of [other(state.server.team), state.server.team]) {
      const kind = stakeFor(config, state, team);
      if (kind && (!stake || rank[kind] > rank[stake.kind])) stake = { team, kind };
    }
  }

  return {
    points,
    games: { ...state.games },
    sets: state.sets.map((s) => ({ ...s })),
    phase: state.phase,
    serving: { ...state.server },
    deuce: inGame && p.A === 3 && p.B === 3 && !deciding,
    decidingPoint: deciding
      ? config.deuceRule === "golden-point"
        ? "golden-point"
        : "star-point"
      : undefined,
    stake,
    winner: state.winner,
  };
}

/** Score lisible en une ligne, en français : « 6-4 3-2 30-15 ». Utile pour les journaux et les tests. */
export function scoreLine(config: MatchConfig, state: MatchState): string {
  const v = view(config, state);
  const sets = v.sets.map((s) =>
    s.matchTiebreak && s.tiebreak ? `[${s.tiebreak.A}-${s.tiebreak.B}]` : `${s.A}-${s.B}`,
  );
  if (v.phase === "finished") return sets.join(" ");
  const current = v.phase === "match-tiebreak" ? [] : [`${v.games.A}-${v.games.B}`];
  const pts =
    v.phase === "game"
      ? `${v.points.A || "-"}-${v.points.B || "-"}`
      : `${v.phase === "match-tiebreak" && config.finalSet === "super-tiebreak" ? "STB" : "TB"} ${v.points.A}-${v.points.B}`;
  return [...sets, ...current, pts].join(" ");
}
