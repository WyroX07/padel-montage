import {
  DEFAULT_CONFIG,
  type DeuceRule,
  type MatchConfig,
  type ScoreEvent,
  type Team,
  replay,
  scoreLine,
} from "@padel/score";
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Scorebug, type ScorebugVariant } from "../src";
import "./demo.css";

type Format = "3-sets" | "super-tb" | "1-set";

const TEAMS: MatchConfig["teams"] = {
  A: { players: ["Lucas Martin", "Hugo Roux"] },
  B: { players: ["Nina Garcia", "Léa Moreau"] },
};

const ACCENTS = [
  { name: "Balle", value: "#d9f04a" },
  { name: "Gazon", value: "#4fd1a5" },
  { name: "Corail", value: "#ff8a65" },
  { name: "Blanc", value: "#f3f6fa" },
];

const p = (seq: string): ScoreEvent[] =>
  [...seq].map((c) => ({ kind: "point", winner: c as Team }));
const g = (t: Team, n = 1) => t.repeat(4 * n);

/** Situations prêtes à charger pour voir chaque cas de l'overlay. */
const SCENARIOS: Array<{ label: string; deuce?: DeuceRule; format?: Format; events: ScoreEvent[] }> = [
  { label: "Début de match", events: p("AB") },
  { label: "Avantage", deuce: "advantage", events: p(g("A") + "AAABBBAB" + "B") },
  { label: "Punto de oro", deuce: "golden-point", events: p(g("A") + g("B") + "AAABBB") },
  { label: "Star point", deuce: "star-point", events: p("BBBAAA" + "AB" + "BA") },
  { label: "Balle de break", events: p(g("A", 2) + g("B") + "BBB") },
  { label: "Tie-break", events: p((g("A") + g("B")).repeat(6) + "ABBAB") },
  {
    label: "Super tie-break",
    format: "super-tb",
    events: p(g("A", 6) + (g("A") + g("B")).repeat(6) + "BBBBBBB" + "ABABAAAABBBAB"),
  },
  { label: "Balle de match", events: p(g("A", 6) + (g("A") + g("B")).repeat(4) + g("A") + "AAA") },
];

function formatConfig(format: Format): Partial<MatchConfig> {
  if (format === "1-set") return { bestOf: 1, finalSet: "full" };
  if (format === "super-tb") return { bestOf: 3, finalSet: "super-tiebreak" };
  return { bestOf: 3, finalSet: "full" };
}

/** Fond de démonstration : un court vu depuis l'arrière de la vitre, comme le rush de test. */
function Court() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const sky = ctx.createLinearGradient(0, 0, 0, h * 0.45);
      sky.addColorStop(0, "#8fb3cf");
      sky.addColorStop(1, "#c9d9e3");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#3c5a3f";
      ctx.fillRect(0, h * 0.3, w, h * 0.1);

      // Court en perspective : bord du fond (loin) et bord proche.
      const far = { y: h * 0.36, l: w * 0.33, r: w * 0.67 };
      const near = { y: h * 1.02, l: -w * 0.08, r: w * 1.08 };
      const at = (u: number, v: number) => {
        // v : 0 au fond, 1 devant ; interpolation qui resserre le lointain.
        const t = v * v * 0.55 + v * 0.45;
        const y = far.y + (near.y - far.y) * t;
        const l = far.l + (near.l - far.l) * t;
        const r = far.r + (near.r - far.r) * t;
        return [l + (r - l) * u, y] as const;
      };
      const quad = (pts: Array<readonly [number, number]>) => {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
      };

      // Vitres et grillage du fond.
      ctx.fillStyle = "rgba(220, 235, 245, 0.35)";
      quad([[far.l, far.y], [far.r, far.y], [far.r, far.y - h * 0.16], [far.l, far.y - h * 0.16]]);
      ctx.fill();

      ctx.fillStyle = "#2f63b8";
      quad([at(0, 0), at(1, 0), at(1, 1), at(0, 1)]);
      ctx.fill();

      // Vitres latérales : 3 m de haut sur les premiers et derniers mètres du court.
      const wall = (u: number, v0: number, v1: number) => {
        const [x0, y0] = at(u, v0);
        const [x1, y1] = at(u, v1);
        const k0 = (y0 - far.y + h * 0.4) * 0.22;
        const k1 = (y1 - far.y + h * 0.4) * 0.22;
        quad([[x0, y0], [x1, y1], [x1, y1 - k1], [x0, y0 - k0]]);
        ctx.fill();
        ctx.stroke();
      };
      ctx.fillStyle = "rgba(225, 238, 246, 0.22)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = 1;
      for (const u of [0, 1]) {
        wall(u, 0, 0.2);
        wall(u, 0.8, 1);
      }

      ctx.strokeStyle = "rgba(255,255,255,0.88)";
      ctx.lineWidth = Math.max(1.5, w / 500);
      const line = (a: readonly [number, number], b: readonly [number, number]) => {
        ctx.beginPath();
        ctx.moveTo(...a);
        ctx.lineTo(...b);
        ctx.stroke();
      };
      // Lignes de service à 3 m du grillage sur un court de 20 m : 0,15 et 0,85.
      line(at(0, 0.15), at(1, 0.15));
      line(at(0, 0.85), at(1, 0.85));
      line(at(0.5, 0.15), at(0.5, 0.85));

      // Filet.
      const [nl, ny] = at(-0.02, 0.5);
      const [nr] = at(1.02, 0.5);
      ctx.fillStyle = "rgba(20, 24, 30, 0.55)";
      ctx.fillRect(nl, ny - h * 0.055, nr - nl, h * 0.055);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillRect(nl, ny - h * 0.058, nr - nl, h * 0.006);

      // Reflet de la vitre derrière laquelle filme le téléphone.
      const glare = ctx.createLinearGradient(0, 0, w, h);
      glare.addColorStop(0, "rgba(255,255,255,0.08)");
      glare.addColorStop(0.5, "rgba(255,255,255,0)");
      glare.addColorStop(1, "rgba(255,255,255,0.05)");
      ctx.fillStyle = glare;
      ctx.fillRect(0, 0, w, h);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);
  return <canvas ref={ref} className="court" aria-hidden="true" />;
}

function Segmented<T extends string>(props: {
  id: string;
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="field">
      <legend>{props.label}</legend>
      <div className="segmented" role="radiogroup">
        {props.options.map((o) => (
          <label key={o.value} className="seg">
            <input
              type="radio"
              id={`${props.id}-${o.value}`}
              name={props.id}
              checked={props.value === o.value}
              onChange={() => props.onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function App() {
  const [deuceRule, setDeuceRule] = useState<DeuceRule>("advantage");
  const [format, setFormat] = useState<Format>("super-tb");
  const [variant, setVariant] = useState<ScorebugVariant>("nuit");
  const [accent, setAccent] = useState(ACCENTS[0]!.value);
  const [events, setEvents] = useState<ScoreEvent[]>(SCENARIOS[0]!.events);

  const config: MatchConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...formatConfig(format), teams: TEAMS, deuceRule }),
    [deuceRule, format],
  );
  const snaps = useMemo(() => replay(config, events), [config, events]);
  const current = snaps.at(-1)!;
  const finished = current.state.phase === "finished";

  const point = (winner: Team) => setEvents((e) => [...e, { kind: "point", winner }]);
  const undo = () => setEvents((e) => e.slice(0, -1));

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLInputElement || ev.metaKey || ev.ctrlKey) return;
      const k = ev.key.toLowerCase();
      if (k === "a") point("A");
      else if (k === "b") point("B");
      else if (k === "backspace" || k === "z") undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const team = (t: Team) => TEAMS[t].players.map((n) => n.split(" ").at(-1)).join(" / ");
  const history = snaps.slice(1).slice(-6).reverse();

  return (
    <main className="page">
      <header className="head">
        <p className="eyebrow">Padel montage · phase 4</p>
        <h1>Tableau de score</h1>
        <p className="lede">
          Le moteur compte points, jeux, sets, tie-breaks et service selon les règles du padel. Marquez des
          points ou chargez une situation pour voir l'overlay réagir.
        </p>
      </header>

      <section className="stage" aria-label="Aperçu sur la vidéo">
        <Court />
        <div className="bug-slot">
          <Scorebug
            config={config}
            state={current.state}
            outcome={current.outcome}
            variant={variant}
            accent={variant === "nuit" ? accent : undefined}
            size="1.7cqw"
          />
        </div>
        <span className="timecode">1080p · 1 920 × 1 080</span>
      </section>

      <section className="controls">
        <div className="score-actions">
          <button type="button" className="btn btn-point" onClick={() => point("A")} disabled={finished}>
            <span className="btn-key">A</span>
            Point {team("A")}
          </button>
          <button type="button" className="btn btn-point" onClick={() => point("B")} disabled={finished}>
            <span className="btn-key">B</span>
            Point {team("B")}
          </button>
          <button type="button" className="btn btn-ghost" onClick={undo} disabled={events.length === 0}>
            Annuler le dernier point
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setEvents([])}>
            Nouveau match
          </button>
        </div>

        <div className="line">
          <span className="line-label">Score</span>
          <code className="line-value">{scoreLine(config, current.state) || "—"}</code>
          <span className="line-count">{events.length} points joués</span>
        </div>

        <div className="settings">
          <Segmented
            id="deuce"
            label="À 40-40"
            value={deuceRule}
            onChange={setDeuceRule}
            options={[
              { value: "advantage", label: "Avantages" },
              { value: "golden-point", label: "Punto de oro" },
              { value: "star-point", label: "Star point" },
            ]}
          />
          <Segmented
            id="format"
            label="Format"
            value={format}
            onChange={setFormat}
            options={[
              { value: "super-tb", label: "2 sets + STB" },
              { value: "3-sets", label: "3 sets" },
              { value: "1-set", label: "1 set" },
            ]}
          />
          <Segmented
            id="variant"
            label="Style"
            value={variant}
            onChange={setVariant}
            options={[
              { value: "nuit", label: "Nuit" },
              { value: "verre", label: "Verre" },
            ]}
          />
          <fieldset className="field" disabled={variant !== "nuit"}>
            <legend>Couleur des points</legend>
            <div className="swatches">
              {ACCENTS.map((a) => (
                <label key={a.value} className="swatch" title={a.name}>
                  <input
                    type="radio"
                    id={`accent-${a.name}`}
                    name="accent"
                    checked={accent === a.value}
                    onChange={() => setAccent(a.value)}
                  />
                  <span style={{ background: a.value }} />
                  <em>{a.name}</em>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="scenarios">
          <h2>Situations</h2>
          <div className="chips">
            {SCENARIOS.map((s) => (
              <button
                key={s.label}
                type="button"
                className="chip"
                onClick={() => {
                  setDeuceRule(s.deuce ?? "advantage");
                  setFormat(s.format ?? "super-tb");
                  setEvents(s.events);
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="history">
          <h2>Derniers points</h2>
          {history.length === 0 ? (
            <p className="muted">Aucun point. Appuyez sur A ou B pour marquer.</p>
          ) : (
            <ol>
              {history.map((s) => (
                <li key={s.index}>
                  <span className="n">{s.index + 1}</span>
                  <span className="who">{s.event?.kind === "point" ? team(s.event.winner) : "Service"}</span>
                  <code>{scoreLine(config, s.state)}</code>
                  {s.outcome.match ? (
                    <span className="flag">Match</span>
                  ) : s.outcome.set ? (
                    <span className="flag">Set</span>
                  ) : s.outcome.game ? (
                    <span className="flag flag-soft">Jeu</span>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
