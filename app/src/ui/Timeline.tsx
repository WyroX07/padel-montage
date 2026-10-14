// Timeline du rush, dessinée en Canvas : règle, forme d'onde, points (blocs à bords
// déplaçables), coups détectés, tête de lecture, et vue d'ensemble du match en dessous.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import type { Dispatch } from "react";
import type { Clip } from "../model/edit";
import type { Action } from "../model/editor";
import type { Peaks } from "../model/peaks";
import { rulerStep, timecode } from "../model/time";
import type { Clock, Mode } from "./usePlayer";

export interface TimelineHandle {
  fit(): void;
  zoom(factor: number): void;
  reveal(id: string): void;
}

interface Props {
  clips: Clip[];
  selected: string | null;
  durationMs: number;
  peaks: Peaks | null;
  clock: Clock;
  playing: boolean;
  mode: Mode;
  snap: boolean;
  dispatch: Dispatch<Action>;
  onSeek(ms: number): void;
}

const RULER_H = 24;
const TRACK_Y = 30;
const TRACK_H = 96;
const OVERVIEW_Y = TRACK_Y + TRACK_H + 12;
const OVERVIEW_H = 22;
export const TIMELINE_HEIGHT = OVERVIEW_Y + OVERVIEW_H + 8;
const EDGE_PX = 7;
const SNAP_PX = 8;
const MIN_MS_PER_PX = 2;

const C = {
  bg: "#0f1012",
  ruler: "#6f747d",
  rulerMinor: "#2a2d32",
  track: "#15171a",
  gapHatch: "rgba(255,255,255,0.025)",
  wave: "#383c43",
  waveIn: "#b9c98a",
  clip: "rgba(214,242,80,0.09)",
  clipSel: "rgba(214,242,80,0.17)",
  clipEdge: "rgba(214,242,80,0.5)",
  clipEdgeManual: "rgba(120,214,255,0.65)",
  accent: "#d6f250",
  label: "#e9ecef",
  labelMuted: "#9aa0a8",
  hit: "rgba(255,255,255,0.45)",
  playhead: "#ff5b4a",
  hover: "rgba(255,255,255,0.28)",
  snap: "#7fd6ff",
  overview: "#1a1c20",
  overviewClip: "rgba(214,242,80,0.55)",
  overviewOut: "rgba(255,255,255,0.18)",
  out: "rgba(255,255,255,0.03)",
  outSel: "rgba(255,255,255,0.08)",
  outEdge: "rgba(255,255,255,0.25)",
  outEdgeSel: "rgba(255,255,255,0.7)",
  waveOut: "#5d626a",
  window: "rgba(255,255,255,0.75)",
};

const FONT = '"Inter Variable", system-ui, sans-serif';
const MONO = '"JetBrains Mono Variable", ui-monospace, monospace';

type Drag =
  | { kind: "scrub" }
  | { kind: "trim"; id: string; edge: "start" | "end"; anchor: number }
  | { kind: "body"; id: string; downX: number; grabOffset: number; moved: boolean; anchor: number }
  | { kind: "overview"; grab: number };

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, rr);
}

export const Timeline = forwardRef<TimelineHandle, Props>(function Timeline(props, ref) {
  const { clips, selected, durationMs, peaks, clock, mode, dispatch, onSeek } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = useRef(800);
  const view = useRef({ start: 0, msPerPx: 1000 });
  const drag = useRef<Drag | null>(null);
  const hoverX = useRef<number | null>(null);
  const snapLine = useRef<number | null>(null);
  const frame = useRef(0);
  const waveCache = useRef<{ key: string; cols: Float32Array } | null>(null);

  // Les gestes lisent toujours les dernières props.
  const live = useRef(props);
  live.current = props;

  const order = useMemo(() => new Map(clips.filter((c) => c.keep).map((c, i) => [c.id, i + 1])), [clips]);
  const peakNorm = useMemo(() => {
    if (!peaks?.values.length) return 1;
    const sorted = Uint8Array.from(peaks.values).sort();
    return Math.max(8, sorted[Math.floor(sorted.length * 0.995)]);
  }, [peaks]);

  const maxMsPerPx = () => Math.max(MIN_MS_PER_PX, durationMs / Math.max(1, width.current - 2));
  const clampView = useCallback(() => {
    const v = view.current;
    v.msPerPx = Math.min(Math.max(v.msPerPx, MIN_MS_PER_PX), maxMsPerPx());
    const span = v.msPerPx * width.current;
    v.start = Math.max(0, Math.min(v.start, Math.max(0, durationMs - span)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs]);

  const xOf = (t: number) => (t - view.current.start) / view.current.msPerPx;
  const tOf = (x: number) => view.current.start + x * view.current.msPerPx;

  const draw = useCallback(() => {
    frame.current = 0;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { clips, selected, peaks, mode } = live.current;
    const dpr = window.devicePixelRatio || 1;
    const W = width.current;
    const H = TIMELINE_HEIGHT;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);
    const v = view.current;
    const t0 = v.start;
    const t1 = v.start + W * v.msPerPx;

    // Règle
    const step = rulerStep(v.msPerPx);
    const minor = step / (step >= 60_000 && step % 4 === 0 ? 4 : 5);
    ctx.font = `500 10.5px ${MONO}`;
    ctx.textBaseline = "middle";
    for (let t = Math.floor(t0 / minor) * minor; t <= t1; t += minor) {
      const x = Math.round(xOf(t)) + 0.5;
      const major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
      ctx.fillStyle = major ? C.ruler : C.rulerMinor;
      ctx.fillRect(x, major ? RULER_H - 9 : RULER_H - 5, 1, major ? 9 : 5);
      if (major) {
        ctx.fillStyle = C.ruler;
        ctx.fillText(timecode(t, step < 1000), x + 4, 9);
      }
    }

    // Piste
    ctx.fillStyle = C.track;
    ctx.fillRect(0, TRACK_Y, W, TRACK_H);
    if (mode === "montage") {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, TRACK_Y, W, TRACK_H);
      ctx.clip();
      ctx.strokeStyle = C.gapHatch;
      ctx.lineWidth = 6;
      for (let x = -TRACK_H; x < W + TRACK_H; x += 14) {
        ctx.beginPath();
        ctx.moveTo(x, TRACK_Y + TRACK_H);
        ctx.lineTo(x + TRACK_H, TRACK_Y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Forme d'onde, mise en cache tant que la vue ne bouge pas.
    const mid = TRACK_Y + TRACK_H / 2;
    let cols: Float32Array | null = null;
    if (peaks?.values.length) {
      const key = `${t0}|${v.msPerPx}|${W}|${peaks.values.length}`;
      if (waveCache.current?.key !== key) {
        const out = new Float32Array(Math.ceil(W));
        const n = peaks.values.length;
        for (let x = 0; x < out.length; x++) {
          const a = Math.floor((t0 + x * v.msPerPx) / peaks.binMs);
          const b = Math.max(a + 1, Math.floor((t0 + (x + 1) * v.msPerPx) / peaks.binMs));
          let m = 0;
          for (let i = Math.max(0, a); i < Math.min(n, b); i++) if (peaks.values[i] > m) m = peaks.values[i];
          out[x] = Math.sqrt(Math.min(1, m / peakNorm));
        }
        waveCache.current = { key, cols: out };
      }
      cols = waveCache.current.cols;
      const amp = TRACK_H / 2 - 14;
      const wave = (color: string) => {
        ctx.fillStyle = color;
        for (let x = 0; x < cols!.length; x++) {
          const h = Math.max(0.5, cols![x] * amp);
          ctx.fillRect(x, mid - h, 1, h * 2);
        }
      };
      wave(C.wave);
    }

    // Points
    for (const c of clips) {
      if (c.end < t0 || c.start > t1) continue;
      const x0 = xOf(c.start);
      const x1 = xOf(c.end);
      const w = Math.max(2, x1 - x0);
      const sel = c.id === selected;
      const out = !c.keep;
      roundRect(ctx, x0, TRACK_Y + 2, w, TRACK_H - 4, 5);
      ctx.fillStyle = out ? (sel ? C.outSel : C.out) : sel ? C.clipSel : C.clip;
      ctx.fill();
      if (cols) {
        ctx.save();
        ctx.clip();
        ctx.fillStyle = out ? C.waveOut : sel ? C.accent : C.waveIn;
        const amp = TRACK_H / 2 - 14;
        for (let x = Math.max(0, Math.floor(x0)); x < Math.min(cols.length, Math.ceil(x1)); x++) {
          const h = Math.max(0.5, cols[x] * amp);
          ctx.fillRect(x, mid - h, 1, h * 2);
        }
        ctx.restore();
      }
      roundRect(ctx, x0 + 0.5, TRACK_Y + 2.5, w - 1, TRACK_H - 5, 5);
      ctx.lineWidth = sel ? 2 : 1;
      if (out) ctx.setLineDash([4, 3]);
      ctx.strokeStyle = out ? (sel ? C.outEdgeSel : C.outEdge) : sel ? C.accent : c.origin === "manuel" ? C.clipEdgeManual : C.clipEdge;
      ctx.stroke();
      ctx.setLineDash([]);

      // Coups détectés
      if (w > 14) {
        ctx.fillStyle = C.hit;
        for (const h of c.hits) {
          if (h < c.start || h > c.end) continue;
          ctx.fillRect(Math.round(xOf(h)), TRACK_Y + TRACK_H - 11, 1, 6);
        }
      }

      // Numéro dans le montage et durée
      if (w > 26) {
        const n = out ? "sans intérêt" : String(order.get(c.id) ?? "");
        ctx.font = `600 11px ${FONT}`;
        const label = w > 92 && !out ? `${n}  ·  ${((c.end - c.start) / 1000).toFixed(1).replace(".", ",")} s` : n;
        const tw = ctx.measureText(label).width;
        if (tw + 14 < w) {
          roundRect(ctx, x0 + 5, TRACK_Y + 6, tw + 10, 17, 4);
          ctx.fillStyle = sel && !out ? C.accent : "rgba(15,16,18,0.78)";
          ctx.fill();
          ctx.fillStyle = sel && !out ? "#14160c" : out ? C.labelMuted : C.label;
          ctx.textBaseline = "middle";
          ctx.fillText(label, x0 + 10, TRACK_Y + 15);
        }
      }

      // Poignées du point sélectionné
      if (sel && w > 18) {
        ctx.fillStyle = "#f4f7e6";
        roundRect(ctx, x0 + 3, mid - 14, 3, 28, 1.5);
        ctx.fill();
        roundRect(ctx, x1 - 6, mid - 14, 3, 28, 1.5);
        ctx.fill();
      }
    }

    // Aimantation
    if (snapLine.current !== null) {
      const x = Math.round(xOf(snapLine.current)) + 0.5;
      ctx.strokeStyle = C.snap;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, TRACK_Y - 4);
      ctx.lineTo(x, TRACK_Y + TRACK_H + 4);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Survol
    if (hoverX.current !== null && !drag.current) {
      const x = Math.round(hoverX.current) + 0.5;
      ctx.fillStyle = C.hover;
      ctx.fillRect(x - 0.5, RULER_H, 1, TRACK_Y - RULER_H + TRACK_H);
    }

    // Tête de lecture
    const ph = clock.get();
    const px = Math.round(xOf(ph)) + 0.5;
    if (px >= -6 && px <= W + 6) {
      ctx.fillStyle = C.playhead;
      ctx.fillRect(px - 0.75, RULER_H - 2, 1.5, TRACK_Y - RULER_H + TRACK_H + 4);
      ctx.beginPath();
      ctx.moveTo(px - 6, RULER_H - 11);
      ctx.lineTo(px + 6, RULER_H - 11);
      ctx.lineTo(px + 6, RULER_H - 6);
      ctx.lineTo(px, RULER_H);
      ctx.lineTo(px - 6, RULER_H - 6);
      ctx.closePath();
      ctx.fill();
    }

    // Vue d'ensemble du match
    roundRect(ctx, 0, OVERVIEW_Y, W, OVERVIEW_H, 5);
    ctx.fillStyle = C.overview;
    ctx.fill();
    const k = W / Math.max(1, durationMs);
    ctx.fillStyle = C.overviewClip;
    for (const c of clips) {
      ctx.fillStyle = c.keep ? C.overviewClip : C.overviewOut;
      ctx.fillRect(c.start * k, OVERVIEW_Y + 6, Math.max(1, (c.end - c.start) * k), OVERVIEW_H - 12);
    }
    const sx = t0 * k;
    const sw = Math.max(6, (t1 - t0) * k);
    roundRect(ctx, sx + 0.5, OVERVIEW_Y + 0.5, Math.min(sw, W - sx) - 1, OVERVIEW_H - 1, 5);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fill();
    ctx.strokeStyle = C.window;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = C.playhead;
    ctx.fillRect(Math.round(ph * k) - 0.5, OVERVIEW_Y - 2, 1.5, OVERVIEW_H + 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock, order, peakNorm, durationMs]);

  const schedule = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(draw);
  }, [draw]);

  useEffect(schedule, [schedule, clips, selected, peaks, mode]);
  useEffect(() => {
    void document.fonts?.ready.then(schedule);
  }, [schedule]);

  // Taille du canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(([e]) => {
      const fitted = view.current.msPerPx >= maxMsPerPx() - 1e-6;
      width.current = Math.max(100, e.contentRect.width);
      if (fitted) view.current.msPerPx = maxMsPerPx();
      clampView();
      schedule();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, clampView]);

  // Nouvelle durée : on montre tout le match.
  useEffect(() => {
    view.current = { start: 0, msPerPx: maxMsPerPx() };
    schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs]);

  // La tête de lecture : redessin, et la vue suit pendant la lecture.
  useEffect(
    () =>
      clock.subscribe(() => {
        const v = view.current;
        const span = v.msPerPx * width.current;
        const t = clock.get();
        if (live.current.playing && !drag.current && (t > v.start + span * 0.96 || t < v.start)) {
          v.start = t - span * 0.08;
          clampView();
        }
        schedule();
      }),
    [clock, schedule, clampView],
  );

  const zoomAt = useCallback(
    (factor: number, x: number) => {
      const v = view.current;
      const t = tOf(x);
      v.msPerPx *= factor;
      clampView();
      v.start = t - x * v.msPerPx;
      clampView();
      schedule();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clampView, schedule],
  );

  const reveal = useCallback(
    (id: string) => {
      const c = live.current.clips.find((x) => x.id === id);
      if (!c) return;
      const v = view.current;
      const span = v.msPerPx * width.current;
      const len = c.end - c.start;
      if (len > span * 0.9) {
        v.msPerPx = (len * 1.4) / width.current;
        clampView();
      }
      const span2 = v.msPerPx * width.current;
      if (c.start < v.start || c.end > v.start + span2) {
        v.start = (c.start + c.end) / 2 - span2 / 2;
        clampView();
      }
      schedule();
    },
    [clampView, schedule],
  );

  useImperativeHandle(
    ref,
    () => ({
      fit() {
        view.current = { start: 0, msPerPx: maxMsPerPx() };
        schedule();
      },
      zoom(factor) {
        const x = Math.min(Math.max(xOf(clock.get()), 0), width.current);
        zoomAt(factor, x);
      },
      reveal,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schedule, zoomAt, reveal, clock],
  );

  // La sélection au clavier ou depuis la liste reste visible.
  useEffect(() => {
    if (selected && !drag.current) reveal(selected);
  }, [selected, reveal]);

  // Aimantation : tête de lecture, coups et bords des autres points.
  const snapTo = (t: number, exclude: string | null, alt: boolean): number => {
    snapLine.current = null;
    if (!live.current.snap || alt) return t;
    const limit = SNAP_PX * view.current.msPerPx;
    let best = t;
    let bestD = limit;
    const consider = (c: number) => {
      const d = Math.abs(c - t);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    };
    // La tête de lecture d'avant le geste : pendant un rognage, c'est le geste qui la déplace.
    const d = drag.current;
    if (d && d.kind !== "scrub" && d.kind !== "overview") consider(d.anchor);
    for (const c of live.current.clips) {
      if (c.end < t - limit * 40 || c.start > t + limit * 40) continue;
      for (const h of c.hits) consider(h);
      if (c.id !== exclude) {
        consider(c.start);
        consider(c.end);
      }
    }
    if (best !== t) snapLine.current = best;
    return best;
  };

  interface Hit {
    zone: "ruler" | "track" | "overview" | "none";
    clip?: Clip;
    edge?: "start" | "end";
  }

  const hitTest = (x: number, y: number): Hit => {
    if (y >= OVERVIEW_Y - 4) return { zone: "overview" };
    if (y < TRACK_Y - 2) return { zone: "ruler" };
    if (y > TRACK_Y + TRACK_H + 2) return { zone: "none" };
    const { clips, selected } = live.current;
    const candidates = [...clips].sort((a, b) => (a.id === selected ? -1 : b.id === selected ? 1 : 0));
    let best: Hit | null = null;
    let bestD = EDGE_PX + 1;
    for (const c of candidates) {
      const x0 = xOf(c.start);
      const x1 = xOf(c.end);
      if (x1 < -EDGE_PX || x0 > width.current + EDGE_PX) continue;
      const bonus = c.id === selected ? 2 : 0;
      const ds = Math.abs(x - x0) - bonus;
      const de = Math.abs(x - x1) - bonus;
      if (ds < bestD && (x1 - x0 > 16 || ds <= de)) {
        bestD = ds;
        best = { zone: "track", clip: c, edge: "start" };
      }
      if (de < bestD && (x1 - x0 > 16 || de < ds)) {
        bestD = de;
        best = { zone: "track", clip: c, edge: "end" };
      }
    }
    if (best) return best;
    const t = tOf(x);
    const inside = clips.find((c) => t >= c.start && t <= c.end);
    return { zone: "track", clip: inside };
  };

  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const overviewTo = (x: number, grab: number) => {
    const v = view.current;
    v.start = (x / width.current) * durationMs - grab;
    clampView();
    schedule();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const { x, y } = local(e);
    const hit = hitTest(x, y);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (hit.zone === "overview") {
      const v = view.current;
      const span = v.msPerPx * width.current;
      const t = (x / width.current) * durationMs;
      const grab = t >= v.start && t <= v.start + span ? t - v.start : span / 2;
      drag.current = { kind: "overview", grab };
      overviewTo(x, grab);
      return;
    }
    if (hit.zone === "track" && hit.clip && hit.edge) {
      drag.current = { kind: "trim", id: hit.clip.id, edge: hit.edge, anchor: clock.get() };
      dispatch({ type: "gestureStart" });
      dispatch({ type: "select", id: hit.clip.id });
      return;
    }
    if (hit.zone === "track" && hit.clip) {
      drag.current = { kind: "body", id: hit.clip.id, downX: x, grabOffset: tOf(x) - hit.clip.start, moved: false, anchor: clock.get() };
      dispatch({ type: "select", id: hit.clip.id });
      return;
    }
    drag.current = { kind: "scrub" };
    onSeek(tOf(x));
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = local(e);
    hoverX.current = y < OVERVIEW_Y - 4 ? x : null;
    const d = drag.current;
    const canvas = e.currentTarget;
    if (!d) {
      const hit = hitTest(x, y);
      canvas.style.cursor = hit.edge ? "ew-resize" : hit.clip ? "grab" : hit.zone === "overview" ? "pointer" : "default";
      schedule();
      return;
    }
    if (d.kind === "overview") {
      overviewTo(x, d.grab);
      return;
    }
    if (d.kind === "scrub") {
      onSeek(snapTo(tOf(x), null, e.altKey));
      snapLine.current = null;
      schedule();
      return;
    }
    if (d.kind === "trim") {
      const t = snapTo(tOf(x), d.id, e.altKey);
      dispatch({ type: "trim", id: d.id, edge: d.edge, t });
      // Aperçu : la vidéo montre l'image sous le bord qu'on déplace.
      onSeek(d.edge === "start" ? t : t - 40);
      schedule();
      return;
    }
    if (d.kind === "body") {
      if (!d.moved && Math.abs(x - d.downX) < 4) return;
      if (!d.moved) {
        d.moved = true;
        dispatch({ type: "gestureStart" });
        canvas.style.cursor = "grabbing";
      }
      const c = live.current.clips.find((k) => k.id === d.id);
      if (!c) return;
      const len = c.end - c.start;
      let start = tOf(x) - d.grabOffset;
      const s1 = snapTo(start, d.id, e.altKey);
      const sl = snapLine.current;
      const s2 = snapTo(start + len, d.id, e.altKey) - len;
      if (snapLine.current !== null && (sl === null || Math.abs(s2 - start) < Math.abs(s1 - start))) start = s2;
      else {
        snapLine.current = sl;
        start = s1;
      }
      dispatch({ type: "slide", id: d.id, start });
      schedule();
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    drag.current = null;
    snapLine.current = null;
    if (!d) return;
    if (d.kind === "trim") dispatch({ type: "gestureEnd" });
    if (d.kind === "body") {
      if (d.moved) dispatch({ type: "gestureEnd" });
      else onSeek(tOf(local(e).x));
      e.currentTarget.style.cursor = "grab";
    }
    schedule();
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = local(e);
    const hit = hitTest(x, y);
    if (hit.zone === "track" && !hit.clip) dispatch({ type: "add", at: tOf(x) });
  };

  // Molette : défilement ; Ctrl/Cmd (ou pincement du pavé) : zoom autour du curseur.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { x } = local(e);
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(e.deltaY * 0.0025), x);
        return;
      }
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      view.current.start += delta * view.current.msPerPx;
      clampView();
      schedule();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomAt, clampView, schedule]);

  return (
    <canvas
      ref={canvasRef}
      className="timeline-canvas"
      style={{ height: TIMELINE_HEIGHT }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => {
        hoverX.current = null;
        schedule();
      }}
      onDoubleClick={onDoubleClick}
      aria-label="Timeline du rush"
      role="img"
    />
  );
});
