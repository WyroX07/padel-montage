import { type MatchConfig, type MatchState, type Outcome, type Team, view } from "@padel/score";
import type { CSSProperties } from "react";
// Police embarquée (SIL OFL) : rendu identique hors ligne et dans les images d'export.
import "@fontsource/saira-condensed/latin-400.css";
import "@fontsource/saira-condensed/latin-500.css";
import "@fontsource/saira-condensed/latin-600.css";
import "@fontsource/saira-condensed/latin-700.css";
import "@fontsource/saira-condensed/latin-800.css";
import "./scorebug.css";

export type ScorebugVariant = "nuit" | "verre";

export interface ScorebugProps {
  config: MatchConfig;
  state: MatchState;
  /** Ce que le dernier point a gagné ; affiche « Set » ou « Jeu, set et match ». */
  outcome?: Outcome;
  /** `nuit` : panneau sombre ; `verre` : verre dépoli clair, pour les vidéos sombres. */
  variant?: ScorebugVariant;
  /** Couleur de la colonne des points (par défaut jaune balle). */
  accent?: string;
  /**
   * Taille de base : un nombre de pixels ou une longueur CSS (`"1.45cqw"` pour suivre le lecteur).
   * Tout l'overlay est proportionnel ; environ 2,6 % de la hauteur de la vidéo.
   */
  size?: number | string;
  className?: string;
  /** `false` coupe les animations : pour le rendu d'images à l'export. */
  animate?: boolean;
}

interface Chip {
  text: string;
  team?: Team;
  tone: "accent" | "plain";
}

const surname = (name: string) => name.trim().split(/\s+/).at(-1) ?? name;

function teamLabel(config: MatchConfig, team: Team) {
  const t = config.teams[team];
  return t.name ?? t.players.map(surname).join(" / ");
}

function chipsFor(config: MatchConfig, v: ReturnType<typeof view>, outcome?: Outcome): Chip[] {
  if (outcome?.match) return [{ text: "Jeu, set et match", team: outcome.match, tone: "accent" }];
  const chips: Chip[] = [];
  if (outcome?.set) chips.push({ text: "Set", team: outcome.set, tone: "accent" });
  if (v.phase === "tiebreak") chips.push({ text: "Tie-break", tone: "plain" });
  if (v.phase === "match-tiebreak") {
    chips.push({ text: config.finalSet === "super-tiebreak" ? "Super tie-break" : "Tie-break décisif", tone: "plain" });
  }
  if (v.decidingPoint) {
    chips.push({ text: v.decidingPoint === "golden-point" ? "Punto de oro" : "Star point", tone: "plain" });
  }
  if (v.stake) {
    const label = { match: "Balle de match", set: "Balle de set", break: "Balle de break" }[v.stake.kind];
    chips.push({ text: label, team: v.stake.team, tone: "accent" });
  }
  return chips;
}

/** Roule le chiffre quand il change : l'ancien part, le nouveau arrive par le bas. */
function Roll({ value }: { value: string | number }) {
  return (
    <span className="pm-roll">
      <span key={String(value)} className="pm-roll-in">
        {value}
      </span>
    </span>
  );
}

function Ball() {
  return (
    <svg className="pm-ball" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="9" />
      <path d="M3.2 4.6c3.6 2.4 3.6 8.4 0 10.8M16.8 4.6c-3.6 2.4-3.6 8.4 0 10.8" />
    </svg>
  );
}

export function Scorebug({
  config,
  state,
  outcome,
  variant = "nuit",
  accent,
  size = 28,
  className,
  animate = true,
}: ScorebugProps) {
  const v = view(config, state);
  const finished = v.phase === "finished";
  const showGames = v.phase !== "match-tiebreak" && !finished;
  const showPoints = !finished;
  const chips = chipsFor(config, v, outcome);

  const columns = [
    "1.1em",
    "minmax(0, auto)",
    ...v.sets.map(() => "1.35em"),
    ...(showGames ? ["1.6em"] : []),
    ...(showPoints ? ["2.35em"] : []),
  ].join(" ");

  const style = {
    "--pm-size": typeof size === "number" ? `${size}px` : size,
    ...(accent ? { "--pm-accent": accent } : {}),
  } as CSSProperties;

  return (
    <div
      className={["pm-bug", className].filter(Boolean).join(" ")}
      data-variant={variant}
      data-static={animate ? undefined : ""}
      style={style}
      role="group"
      aria-label="Score"
    >
      <div className="pm-table" style={{ gridTemplateColumns: columns }}>
        {(["A", "B"] as const).map((team) => {
          const serving = !finished && v.serving.team === team;
          const lost = finished && v.winner !== team;
          const players = config.teams[team].players;
          return (
            <div key={team} className="pm-row" data-team={team} data-lost={lost || undefined}>
              <span className="pm-serve">{serving && <Ball />}</span>
              <span className="pm-name">
                {config.teams[team].name ? (
                  <span>{config.teams[team].name}</span>
                ) : (
                  players.map((p, i) => (
                    <span
                      key={i}
                      className="pm-player"
                      data-serving={(serving && v.serving.player === i) || undefined}
                    >
                      {surname(p)}
                    </span>
                  ))
                )}
              </span>
              {v.sets.map((s, i) => (
                <span key={i} className="pm-set" data-won={s[team] > s[team === "A" ? "B" : "A"] || undefined}>
                  {s.matchTiebreak && s.tiebreak ? s.tiebreak[team] : s[team]}
                  {s.tiebreak && !s.matchTiebreak && s[team] < s[team === "A" ? "B" : "A"] && (
                    <sup>{s.tiebreak[team]}</sup>
                  )}
                </span>
              ))}
              {showGames && (
                <span className="pm-games">
                  <Roll value={v.games[team]} />
                </span>
              )}
              {showPoints && (
                <span className="pm-points" data-adv={v.points[team] === "AV" || undefined}>
                  <Roll value={v.points[team]} />
                </span>
              )}
            </div>
          );
        })}
      </div>
      {chips.length > 0 && (
        <div className="pm-tags" key={chips.map((c) => c.text + (c.team ?? "")).join("|")}>
          {chips.map((c) => (
            <span key={c.text} className="pm-tag" data-tone={c.tone}>
              {c.text}
              {c.team && <span className="pm-tag-team">{teamLabel(config, c.team)}</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
