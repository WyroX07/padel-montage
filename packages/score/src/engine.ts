import type {
  GameScore,
  MatchConfig,
  MatchState,
  Outcome,
  Phase,
  Player,
  ScoreEvent,
  Server,
  SetScore,
  Snapshot,
  Team,
} from "./types";

export const other = (team: Team): Team => (team === "A" ? "B" : "A");

const flip = (player: Player): Player => (player === 0 ? 1 : 0);

const zeroPoints = (): GameScore => ({ A: 0, B: 0, deuces: 0 });

/** Égalités à atteindre avant que le point suivant décide du jeu. */
export function decidingDeuce(config: MatchConfig): number {
  switch (config.deuceRule) {
    case "golden-point":
      return 1;
    case "star-point":
      return 3;
    case "advantage":
      return Number.POSITIVE_INFINITY;
  }
}

const setsToWin = (config: MatchConfig): number => Math.floor(config.bestOf / 2) + 1;

const setsWon = (sets: SetScore[], team: Team): number =>
  sets.filter((s) => s[team] > s[other(team)]).length;

/** Points pour gagner le tie-break décisif qui remplace le dernier set. */
export const matchTiebreakPoints = (config: MatchConfig): number =>
  config.finalSet === "tiebreak" ? config.tiebreakPoints : config.superTiebreakPoints;

/** Le set qui commence est-il le set décisif, joué en tie-break ? */
function isMatchTiebreakSet(config: MatchConfig, sets: SetScore[]): boolean {
  if (config.finalSet === "full" || config.bestOf === 1) return false;
  const need = setsToWin(config) - 1;
  return setsWon(sets, "A") === need && setsWon(sets, "B") === need;
}

function rotate(state: MatchState): void {
  const team = other(state.server.team);
  state.server = { team, player: state.nextPlayer[team] };
  state.nextPlayer = { ...state.nextPlayer, [team]: flip(state.nextPlayer[team]) };
}

function withServer(state: MatchState, server: Server): void {
  state.server = { ...server };
  state.nextPlayer = { ...state.nextPlayer, [server.team]: flip(server.player) };
}

export function initialState(config: MatchConfig): MatchState {
  const start = config.start ?? {};
  const sets: SetScore[] = (start.sets ?? []).map(([A, B]) => ({ A, B }));
  const [gA, gB] = start.games ?? [0, 0];
  const state: MatchState = {
    sets,
    games: { A: gA, B: gB },
    points: zeroPoints(),
    phase: "game",
    server: { ...config.firstServer },
    nextPlayer: { A: 0, B: 0 },
  };
  withServer(state, start.server ?? config.firstServer);
  const won = matchWinner(config, sets);
  if (won) {
    state.phase = "finished";
    state.winner = won;
  } else if (isMatchTiebreakSet(config, sets)) {
    startTiebreak(state, "match-tiebreak");
  } else if (config.tiebreak && gA === config.gamesPerSet && gB === config.gamesPerSet) {
    startTiebreak(state, "tiebreak");
  }
  return state;
}

function matchWinner(config: MatchConfig, sets: SetScore[]): Team | undefined {
  const need = setsToWin(config);
  if (setsWon(sets, "A") >= need) return "A";
  if (setsWon(sets, "B") >= need) return "B";
  return undefined;
}

function startTiebreak(state: MatchState, phase: Phase): void {
  state.phase = phase;
  state.points = zeroPoints();
  state.tiebreakFirstServer = state.server.team;
}

function closeSet(state: MatchState, config: MatchConfig, set: SetScore, outcome: Outcome): void {
  const winner: Team = set.A > set.B ? "A" : "B";
  state.sets = [...state.sets, set];
  state.games = { A: 0, B: 0 };
  state.points = zeroPoints();
  outcome.set = winner;

  const tbFirst = state.tiebreakFirstServer;
  state.tiebreakFirstServer = undefined;
  if (tbFirst) {
    // Après un tie-break, l'équipe qui a reçu le premier point sert le premier jeu du set suivant.
    if (state.server.team === tbFirst) rotate(state);
  } else {
    rotate(state);
  }

  const won = matchWinner(config, state.sets);
  if (won) {
    state.phase = "finished";
    state.winner = won;
    outcome.match = won;
  } else if (isMatchTiebreakSet(config, state.sets)) {
    startTiebreak(state, "match-tiebreak");
  } else {
    state.phase = "game";
  }
}

function winGame(state: MatchState, config: MatchConfig, team: Team, outcome: Outcome): void {
  outcome.game = team;
  const games = { ...state.games, [team]: state.games[team] + 1 };
  const n = config.gamesPerSet;
  const lead = games[team] - games[other(team)];
  if (games[team] >= n && lead >= 2) {
    closeSet(state, config, { A: games.A, B: games.B }, outcome);
    return;
  }
  state.games = games;
  state.points = zeroPoints();
  rotate(state);
  if (config.tiebreak && games.A === n && games.B === n) startTiebreak(state, "tiebreak");
}

function pointInGame(state: MatchState, config: MatchConfig, team: Team, outcome: Outcome): void {
  const p = state.points;
  const deciding = p.A === 3 && p.B === 3 && p.deuces >= decidingDeuce(config);
  const next: GameScore = { ...p, [team]: p[team] + 1 };
  const mine = next[team];
  const theirs = next[other(team)];

  if (deciding || (mine >= 4 && mine - theirs >= 2)) {
    winGame(state, config, team, outcome);
    return;
  }
  if (next.A >= 3 && next.A === next.B) {
    // Retour à égalité : on ramène à 40-40 et on compte l'égalité.
    state.points = { A: 3, B: 3, deuces: p.deuces + 1 };
    return;
  }
  state.points = next;
}

function pointInTiebreak(state: MatchState, config: MatchConfig, team: Team, outcome: Outcome): void {
  const target = state.phase === "match-tiebreak" ? matchTiebreakPoints(config) : config.tiebreakPoints;
  const next: GameScore = { ...state.points, [team]: state.points[team] + 1 };
  if (next[team] >= target && next[team] - next[other(team)] >= 2) {
    const tiebreak = { A: next.A, B: next.B };
    const set: SetScore =
      state.phase === "match-tiebreak"
        ? { A: team === "A" ? 1 : 0, B: team === "B" ? 1 : 0, tiebreak, matchTiebreak: true }
        : {
            A: state.games.A + (team === "A" ? 1 : 0),
            B: state.games.B + (team === "B" ? 1 : 0),
            tiebreak,
          };
    state.points = next;
    closeSet(state, config, set, outcome);
    return;
  }
  state.points = next;
  // Service : 1 point pour le premier serveur, puis 2 points chacun.
  if ((next.A + next.B) % 2 === 1) rotate(state);
}

function cloneState(state: MatchState): MatchState {
  return {
    ...state,
    sets: state.sets.map((s) => ({ ...s, tiebreak: s.tiebreak && { ...s.tiebreak } })),
    games: { ...state.games },
    points: { ...state.points },
    server: { ...state.server },
    nextPlayer: { ...state.nextPlayer },
  };
}

/** Applique un événement sans modifier l'état reçu. */
export function applyEvent(
  config: MatchConfig,
  state: MatchState,
  event: ScoreEvent,
): { state: MatchState; outcome: Outcome } {
  const next = cloneState(state);
  const outcome: Outcome = {};
  if (event.kind === "server") {
    withServer(next, event.server);
    if (next.phase === "tiebreak" || next.phase === "match-tiebreak") {
      if (next.points.A + next.points.B === 0) next.tiebreakFirstServer = event.server.team;
    }
    return { state: next, outcome };
  }
  if (next.phase === "finished") return { state: next, outcome: { ignored: true } };
  if (next.phase === "game") pointInGame(next, config, event.winner, outcome);
  else pointInTiebreak(next, config, event.winner, outcome);
  return { state: next, outcome };
}

/** Rejoue toute la liste et renvoie l'état initial suivi d'un instantané par événement. */
export function replay(config: MatchConfig, events: readonly ScoreEvent[]): Snapshot[] {
  let state = initialState(config);
  const snapshots: Snapshot[] = [{ index: -1, state, outcome: {} }];
  events.forEach((event, index) => {
    const result = applyEvent(config, state, event);
    state = result.state;
    snapshots.push({ index, event, state, outcome: result.outcome });
  });
  return snapshots;
}

/**
 * Score avant chaque point, à partir des seuls gagnants dans l'ordre du rush.
 * `result[i]` est l'état avant le point `i` (avec ce qu'a gagné le point `i - 1`) ;
 * le dernier élément est le score final. `result.length === winners.length + 1`.
 */
export function scoreBeforeEachPoint(config: MatchConfig, winners: readonly Team[]): Snapshot[] {
  return replay(
    config,
    winners.map((winner) => ({ kind: "point", winner })),
  );
}

/**
 * Instantané à afficher au temps `t` du rush : le dernier événement dont `at <= t`.
 * Les événements sans `at` comptent comme déjà joués. `snapshots` vient de `replay`.
 */
export function snapshotAt(snapshots: readonly Snapshot[], t: number): Snapshot {
  let found = snapshots[0]!;
  for (const snap of snapshots) {
    if (snap.index < 0) continue;
    const at = snap.event?.at;
    if (at !== undefined && at > t) break;
    found = snap;
  }
  return found;
}
