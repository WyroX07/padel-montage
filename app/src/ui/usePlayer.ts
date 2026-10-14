// Lecture du rush ou du montage. L'instant courant vit dans un petit magasin à part :
// il change à chaque image et seuls la tête de lecture et les compteurs s'y abonnent.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Clip } from "../model/edit";
import { advance } from "../model/montage";

export type Mode = "rush" | "montage";

export interface Clock {
  get(): number;
  set(t: number): void;
  subscribe(f: () => void): () => void;
}

function createClock(): Clock {
  let t = 0;
  const subs = new Set<() => void>();
  return {
    get: () => t,
    set(v) {
      if (v === t) return;
      t = v;
      for (const f of subs) f();
    },
    subscribe(f) {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
}

export const useClockValue = (clock: Clock) => useSyncExternalStore(clock.subscribe, clock.get);

/** `clips` : les points du montage, dans son ordre. */
export function usePlayer(clips: Clip[], selected: string | null) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const clock = useMemo(createClock, []);
  const [playing, setPlaying] = useState(false);
  const [mode, setModeState] = useState<Mode>("montage");
  const [rate, setRateState] = useState(1);
  /** Point du montage sous la tête de lecture. */
  const [current, setCurrent] = useState<string | null>(null);

  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  const indexRef = useRef(-1);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const currentRef = useRef<string | null>(null);
  currentRef.current = current;

  // La liste a changé (point supprimé, exclu, déplacé) : on retrouve le point courant.
  useEffect(() => {
    const i = clips.findIndex((c) => c.id === currentRef.current);
    if (i >= 0) {
      indexRef.current = i;
      return;
    }
    const t = clock.get();
    const j = clips.findIndex((c) => t >= c.start && t < c.end);
    indexRef.current = j;
    setCurrent(clips[j]?.id ?? null);
  }, [clips, clock]);

  const setIndex = useCallback((i: number) => {
    indexRef.current = i;
    setCurrent(clipsRef.current[i]?.id ?? null);
  }, []);

  const seek = useCallback(
    (ms: number) => {
      const v = videoRef.current;
      const dur = v && Number.isFinite(v.duration) ? v.duration * 1000 : Number.POSITIVE_INFINITY;
      const t = Math.max(0, Math.min(ms, dur));
      if (v) v.currentTime = t / 1000;
      clock.set(t);
      const cs = clipsRef.current;
      const i = cs.findIndex((c) => t >= c.start && t < c.end);
      setIndex(i);
    },
    [clock, setIndex],
  );

  /** En mode montage, la lecture ne part que d'un point : celui sous la tête, sinon le sélectionné. */
  const alignToMontage = useCallback(() => {
    const cs = clipsRef.current;
    if (!cs.length) return false;
    const t = clock.get();
    const inside = cs.findIndex((c) => t >= c.start && t < c.end - 30);
    if (inside >= 0) {
      setIndex(inside);
      return true;
    }
    const sel = cs.findIndex((c) => c.id === selectedRef.current);
    const i = sel >= 0 ? sel : 0;
    seek(cs[i].start);
    setIndex(i);
    return true;
  }, [clock, seek, setIndex]);

  const play = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (modeRef.current === "montage" && !alignToMontage()) return;
    void v.play().catch(() => setPlaying(false));
  }, [alignToMontage]);

  const pause = useCallback(() => videoRef.current?.pause(), []);
  const toggle = useCallback(() => (videoRef.current?.paused ? play() : pause()), [play, pause]);

  const setMode = useCallback(
    (m: Mode) => {
      setModeState(m);
      modeRef.current = m;
      if (m === "montage" && !videoRef.current?.paused) alignToMontage();
    },
    [alignToMontage],
  );

  const setRate = useCallback((r: number) => {
    setRateState(r);
    if (videoRef.current) videoRef.current.playbackRate = r;
  }, []);

  // Boucle de lecture : suit la vidéo et saute d'un point au suivant en mode montage.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (!v) return;
      const t = v.currentTime * 1000;
      const cs = clipsRef.current;
      if (modeRef.current === "montage") {
        if (!cs[indexRef.current]) {
          // Tête posée entre deux points : on reprend au prochain point du rush.
          let next = -1;
          cs.forEach((c, i) => {
            if (c.start >= t && (next < 0 || c.start < cs[next].start)) next = i;
          });
          if (next >= 0) {
            v.currentTime = cs[next].start / 1000;
            clock.set(cs[next].start);
            setIndex(next);
            raf = requestAnimationFrame(tick);
            return;
          }
        }
        const step = advance(cs, indexRef.current, t);
        if (step === "end") {
          v.pause();
          const last = cs[cs.length - 1];
          if (last) {
            v.currentTime = last.end / 1000;
            clock.set(last.end);
          }
          return;
        }
        if (step) {
          v.currentTime = step.t / 1000;
          clock.set(step.t);
          setIndex(step.index);
          raf = requestAnimationFrame(tick);
          return;
        }
      } else {
        const i = indexRef.current;
        if (!(cs[i] && t >= cs[i].start && t < cs[i].end)) setIndex(cs.findIndex((c) => t >= c.start && t < c.end));
      }
      clock.set(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, clock, setIndex]);

  const bind = useMemo(
    () => ({
      ref: videoRef,
      onPlay: () => setPlaying(true),
      onPause: () => setPlaying(false),
      onEnded: () => setPlaying(false),
      onSeeked: () => {
        const v = videoRef.current;
        if (v && v.paused) clock.set(v.currentTime * 1000);
      },
    }),
    [clock],
  );

  return { videoRef, bind, clock, playing, play, pause, toggle, seek, mode, setMode, rate, setRate, current };
}

export type Player = ReturnType<typeof usePlayer>;
