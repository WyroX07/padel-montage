import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  type MatchConfig,
  type ScoreEvent,
  createScoreFile,
  parseScoreFile,
  replay,
  scoreLine,
  snapshotAt,
  sortEvents,
  view,
} from "../src";

const cfg = (over: Partial<MatchConfig> = {}): MatchConfig => ({ ...DEFAULT_CONFIG, ...over });

/** "AAB" = A, A, puis B gagnent un point. Espaces ignorés. */
const pts = (seq: string): ScoreEvent[] =>
  [...seq.replace(/\s/g, "")].map((c) => ({ kind: "point", winner: c as "A" | "B" }));

const last = (config: MatchConfig, seq: string) => replay(config, pts(seq)).at(-1)!;
const line = (config: MatchConfig, seq: string) => scoreLine(config, last(config, seq).state);
const game = (t: "A" | "B") => t.repeat(4);
const games = (t: "A" | "B", n: number) => game(t).repeat(n);

describe("points d'un jeu", () => {
  it("compte 0, 15, 30, 40 puis le jeu", () => {
    const c = cfg();
    expect(line(c, "")).toBe("0-0 0-0");
    expect(line(c, "A")).toBe("0-0 15-0");
    expect(line(c, "AB")).toBe("0-0 15-15");
    expect(line(c, "AAB")).toBe("0-0 30-15");
    expect(line(c, "AAAB")).toBe("0-0 40-15");
    expect(line(c, "AAAA")).toBe("1-0 0-0");
  });

  it("avantages infinis : AV, retour à 40-40, autant de fois que nécessaire", () => {
    const c = cfg({ deuceRule: "advantage" });
    const deuce = "AAABBB";
    expect(line(c, deuce)).toBe("0-0 40-40");
    expect(line(c, deuce + "A")).toBe("0-0 AV--");
    expect(line(c, deuce + "AB")).toBe("0-0 40-40");
    expect(line(c, deuce + "AB".repeat(20) + "B")).toBe("0-0 --AV");
    expect(line(c, deuce + "AB".repeat(20) + "BB")).toBe("0-1 0-0");
    expect(view(c, last(c, deuce).state).deuce).toBe(true);
    expect(view(c, last(c, deuce).state).decidingPoint).toBeUndefined();
  });

  it("punto de oro : à 40-40, le point suivant gagne le jeu", () => {
    const c = cfg({ deuceRule: "golden-point" });
    const v = view(c, last(c, "AAABBB").state);
    expect(v.decidingPoint).toBe("golden-point");
    expect(v.deuce).toBe(false);
    expect(line(c, "AAABBBB")).toBe("0-1 0-0");
    expect(line(c, "AAABBBA")).toBe("1-0 0-0");
  });

  it("star point : deux avantages, puis point décisif à la troisième égalité", () => {
    const c = cfg({ deuceRule: "star-point" });
    // 1re égalité, avantage A, 2e égalité, avantage B, 3e égalité.
    expect(view(c, last(c, "AAABBB").state).decidingPoint).toBeUndefined();
    expect(view(c, last(c, "AAABBB AB").state).decidingPoint).toBeUndefined();
    expect(view(c, last(c, "AAABBB AB BA").state).decidingPoint).toBe("star-point");
    expect(line(c, "AAABBB AB BA A")).toBe("1-0 0-0");
    // Un avantage converti avant la 3e égalité gagne normalement.
    expect(line(c, "AAABBB AB BB")).toBe("0-1 0-0");
  });
});

describe("jeux et sets", () => {
  it("gagne le set à 6 jeux avec 2 d'écart", () => {
    const c = cfg();
    expect(line(c, games("A", 5) + games("B", 4) + game("A"))).toBe("6-4 0-0 0-0");
    expect(line(c, games("A", 5) + games("B", 5) + game("A"))).toBe("6-5 0-0");
    expect(line(c, games("A", 5) + games("B", 5) + game("A") + game("A"))).toBe("7-5 0-0 0-0");
  });

  it("tie-break à 6-6, gagné à 7 points avec 2 d'écart", () => {
    const c = cfg();
    const toSix = games("A", 5) + games("B", 6) + game("A");
    expect(last(c, toSix).state.phase).toBe("tiebreak");
    expect(line(c, toSix + "AAAAAAB")).toBe("6-6 TB 6-1");
    expect(line(c, toSix + "AAAAAAA")).toBe("7-6 0-0 0-0");
    expect(line(c, toSix + "AAAAAABBBBBB")).toBe("6-6 TB 6-6");
    expect(line(c, toSix + "AAAAAABBBBBBBB")).toBe("6-7 0-0 0-0");
    expect(last(c, toSix + "AAAAAAA").state.sets[0]?.tiebreak).toEqual({ A: 7, B: 0 });
  });

  it("sans tie-break, on joue jusqu'à deux jeux d'écart", () => {
    const c = cfg({ tiebreak: false });
    expect(line(c, games("A", 5) + games("B", 6) + game("A") + game("A"))).toBe("7-6 0-0");
    expect(line(c, games("A", 5) + games("B", 6) + game("A") + game("A") + game("A"))).toBe("8-6 0-0 0-0");
  });

  it("format court en 4 jeux", () => {
    const c = cfg({ gamesPerSet: 4 });
    expect(line(c, games("A", 4))).toBe("4-0 0-0 0-0");
  });

  it("match en 2 sets gagnants, les points suivants sont ignorés", () => {
    const c = cfg();
    const seq = games("A", 6) + games("A", 6);
    const end = last(c, seq);
    expect(end.state.winner).toBe("A");
    expect(end.outcome).toEqual({ game: "A", set: "A", match: "A" });
    expect(scoreLine(c, end.state)).toBe("6-0 6-0");
    expect(last(c, seq + "B").outcome.ignored).toBe(true);
  });

  it("super tie-break à 10 au lieu du 3e set", () => {
    const c = cfg({ finalSet: "super-tiebreak" });
    const oneAll = games("A", 6) + games("B", 6);
    expect(last(c, oneAll).state.phase).toBe("match-tiebreak");
    expect(line(c, oneAll + "AAAAAAAAAB")).toBe("6-0 0-6 STB 9-1");
    const end = last(c, oneAll + "AAAAAAAAAA");
    expect(end.state.winner).toBe("A");
    expect(scoreLine(c, end.state)).toBe("6-0 0-6 [10-0]");
  });

  it("par défaut : 2 sets gagnants, super tie-break à une manche partout", () => {
    expect(last(cfg(), games("A", 6) + games("B", 6)).state.phase).toBe("match-tiebreak");
    expect(last(cfg({ finalSet: "full" }), games("A", 6) + games("B", 6)).state.phase).toBe("game");
  });

  it("tie-break à 7 à la place du 3e set (certains tournois)", () => {
    const c = cfg({ finalSet: "tiebreak" });
    const oneAll = games("A", 6) + games("B", 6);
    expect(line(c, oneAll + "AAAAAB")).toBe("6-0 0-6 TB 5-1");
    const end = last(c, oneAll + "AAAAAAA");
    expect(end.state.winner).toBe("A");
    expect(scoreLine(c, end.state)).toBe("6-0 0-6 [7-0]");
  });

  it("un seul set", () => {
    const c = cfg({ bestOf: 1, finalSet: "super-tiebreak" });
    expect(last(c, games("B", 6)).state.winner).toBe("B");
  });
});

describe("service", () => {
  it("tourne A1, B1, A2, B2 à chaque jeu", () => {
    const c = cfg({ firstServer: { team: "A", player: 0 } });
    const snaps = replay(c, pts(games("A", 5)));
    const servers = [0, 4, 8, 12, 16].map((i) => snaps[i]!.state.server);
    expect(servers).toEqual([
      { team: "A", player: 0 },
      { team: "B", player: 0 },
      { team: "A", player: 1 },
      { team: "B", player: 1 },
      { team: "A", player: 0 },
    ]);
  });

  it("change au 1er point du tie-break puis tous les 2 points", () => {
    const c = cfg();
    const toSix = games("A", 5) + games("B", 6) + game("A");
    const snaps = replay(c, pts(toSix + "ABABAB"));
    const base = toSix.length;
    const teams = [0, 1, 2, 3, 4, 5].map((k) => snaps[base + k]!.state.server.team);
    // 12 jeux joués depuis A : A sert le tie-break.
    expect(teams).toEqual(["A", "B", "B", "A", "A", "B"]);
  });

  it("après le tie-break, le receveur du 1er point sert le set suivant", () => {
    const c = cfg();
    const toSix = games("A", 5) + games("B", 6) + game("A");
    for (const tb of ["AAAAAAA", "AAAAAABBBBBBBB", "BBBBBBB"]) {
      const s = last(c, toSix + tb).state;
      expect(s.sets).toHaveLength(1);
      expect(s.server.team).toBe("B");
    }
  });

  it("le serveur peut être corrigé à la main", () => {
    const c = cfg();
    const events: ScoreEvent[] = [
      ...pts(game("A")),
      { kind: "server", server: { team: "B", player: 1 } },
      ...pts(game("B")),
    ];
    const s = replay(c, events).at(-1)!.state;
    expect(s.server.team).toBe("A");
    // Puis B reprendra avec l'autre joueur.
    expect(s.nextPlayer.B).toBe(0);
  });
});

describe("balles de break, set et match", () => {
  it("balle de break pour le receveur", () => {
    const c = cfg();
    expect(view(c, last(c, "BBB").state).stake).toEqual({ team: "B", kind: "break" });
    expect(view(c, last(c, "AAA").state).stake).toBeUndefined();
  });

  it("balle de set et balle de match", () => {
    const c = cfg();
    expect(view(c, last(c, games("A", 5) + "AAA").state).stake).toEqual({ team: "A", kind: "set" });
    expect(view(c, last(c, games("A", 6) + games("A", 5) + "AAA").state).stake).toEqual({ team: "A", kind: "match" });
  });

  it("sur un punto de oro, on garde la balle la plus importante", () => {
    const c = cfg({ deuceRule: "golden-point" });
    // A mène 5-4, B sert le 10e jeu : le point décisif est balle de break et balle de set pour A.
    const seq = (games("A", 1) + games("B", 1)).repeat(4) + games("A", 1) + "AAABBB";
    const s = last(c, seq).state;
    const v = view(c, s);
    expect(v.decidingPoint).toBe("golden-point");
    expect(v.stake).toEqual({ team: "A", kind: "set" });
  });

  it("balle de match en super tie-break", () => {
    const c = cfg({ finalSet: "super-tiebreak" });
    const s = last(c, games("A", 6) + games("B", 6) + "BBBBBBBBB").state;
    expect(view(c, s).stake).toEqual({ team: "B", kind: "match" });
  });
});

describe("départ en cours de match", () => {
  it("reprend à 6-4 3-2", () => {
    const c = cfg({ start: { sets: [[6, 4]], games: [3, 2], server: { team: "B", player: 1 } } });
    expect(line(c, "")).toBe("6-4 3-2 0-0");
    expect(last(c, "").state.server).toEqual({ team: "B", player: 1 });
    expect(line(c, games("A", 3))).toBe("6-4 6-2");
  });

  it("reprend directement en tie-break", () => {
    const c = cfg({ start: { games: [6, 6] } });
    expect(last(c, "").state.phase).toBe("tiebreak");
  });
});

describe("temps du rush", () => {
  it("affiche le score du dernier point joué avant t", () => {
    const c = cfg();
    const events: ScoreEvent[] = [
      { kind: "point", winner: "A", at: 10 },
      { kind: "point", winner: "A", at: 30 },
      { kind: "point", winner: "B", at: 55 },
    ];
    const snaps = replay(c, events);
    expect(scoreLine(c, snapshotAt(snaps, 5).state)).toBe("0-0 0-0");
    expect(scoreLine(c, snapshotAt(snaps, 10).state)).toBe("0-0 15-0");
    expect(scoreLine(c, snapshotAt(snaps, 54.9).state)).toBe("0-0 30-0");
    expect(scoreLine(c, snapshotAt(snaps, 999).state)).toBe("0-0 30-15");
  });

  it("trie les événements par temps", () => {
    const sorted = sortEvents([
      { kind: "point", winner: "A", at: 30 },
      { kind: "point", winner: "B", at: 10 },
    ]);
    expect(sorted.map((e) => e.at)).toEqual([10, 30]);
  });
});

describe("fichier padel-score/v1", () => {
  it("aller-retour JSON", () => {
    const file = createScoreFile({ deuceRule: "golden-point" });
    file.events.push({ kind: "point", winner: "A", at: 12.5, id: "rally-1" });
    expect(parseScoreFile(JSON.stringify(file))).toEqual(file);
  });

  it("refuse un fichier invalide avec un message en français", () => {
    expect(() => parseScoreFile("{")).toThrow("JSON valide");
    expect(() => parseScoreFile('{"format":"autre"}')).toThrow("Format de score inconnu");
    expect(() =>
      parseScoreFile(JSON.stringify({ format: "padel-score/v1", events: [{ kind: "point", winner: "C" }] })),
    ).toThrow("Événement n° 1 invalide");
  });
});
