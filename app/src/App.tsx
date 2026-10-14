import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { type Clip, type EditDoc, emptyDoc, FormatError, parseDocument, serializeEdit, toGroundTruth } from "./model/edit";
import { initialState, isDirty, reducer } from "./model/editor";
import { startOffsets } from "./model/montage";
import { kept, totalDuration } from "./model/ops";
import type { Peaks } from "./model/peaks";
import { duration, timecode } from "./model/time";
import { platform, type Session } from "./platform";
import { ClipList } from "./ui/ClipList";
import { HelpDialog } from "./ui/HelpDialog";
import { Icon } from "./ui/icons";
import { JobDialog, type Job } from "./ui/JobDialog";
import { Timeline, type TimelineHandle } from "./ui/Timeline";
import { Toasts, useToasts } from "./ui/Toasts";
import { type Mode, useClockValue, usePlayer } from "./ui/usePlayer";
import { Welcome } from "./ui/Welcome";

const FRAME_MS = 1000 / 30;
const AUTOSAVE_MS = 1200;

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [session, setSession] = useState<Session | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [peaks, setPeaks] = useState<Peaks | null>(null);
  const [peaksProgress, setPeaksProgress] = useState<number | null>(null);
  const [unplayable, setUnplayable] = useState(false);
  const [snap, setSnap] = useState(true);
  const [muted, setMuted] = useState(false);
  const [help, setHelp] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const toasts = useToasts();
  const notify = toasts.push;
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const timeline = useRef<TimelineHandle>(null);

  const doc = state.doc;
  const clips = useMemo(() => doc?.clips ?? [], [doc]);
  const montage = useMemo(() => kept(clips), [clips]);
  const player = usePlayer(montage, state.selected);
  const { clock, seek } = player;

  const durationMs = videoDuration ?? doc?.duration_ms ?? Math.max(60_000, ...clips.map((c) => c.end + 10_000));

  // ---------- Ouverture ----------

  const openSession = useCallback(
    (s: Session | null) => {
      if (!s) return;
      setSession(s);
      setVideoUrl(s.url);
      setVideoDuration(null);
      setPeaks(null);
      setUnplayable(false);
      let loaded: EditDoc = emptyDoc(s.name, null);
      if (s.document) {
        try {
          loaded = parseDocument(s.document.text, s.name);
          notify(
            loaded.clips.length
              ? `${loaded.clips.length} points chargés depuis ${s.document.name}`
              : `${s.document.name} ne contient aucun point`,
          );
        } catch (e) {
          notify(e instanceof FormatError ? e.message : `Lecture de ${s.document.name} impossible`, "error");
        }
      }
      dispatch({ type: "load", doc: loaded });
      seek(0);
    },
    [notify, seek],
  );

  const open = useCallback(async () => {
    try {
      openSession(await platform.openSession());
    } catch (e) {
      notify(String(e), "error");
    }
  }, [openSession, notify]);

  useEffect(() => platform.onDrop?.(openSession), [openSession]);

  const importPoints = useCallback(async () => {
    if (!session) return;
    try {
      const file = await platform.openDocument();
      if (!file) return;
      const d = parseDocument(file.text, session.name);
      dispatch({ type: "replace", clips: d.clips });
      notify(`${d.clips.length} points importés depuis ${file.name}. Ctrl+Z pour revenir en arrière.`);
    } catch (e) {
      notify(e instanceof FormatError ? e.message : String(e), "error");
    }
  }, [session, notify]);

  // Forme d'onde
  useEffect(() => {
    if (!session) return;
    let alive = true;
    setPeaksProgress(0);
    platform
      .peaks(session, (f) => alive && setPeaksProgress(f))
      .then((p) => alive && setPeaks(p))
      .catch((e) => alive && notify(`Forme d'onde indisponible : ${String(e)}`, "error"))
      .finally(() => alive && setPeaksProgress(null));
    return () => {
      alive = false;
    };
  }, [session, notify]);

  // Codec lisible ? Sinon on propose un aperçu léger.
  useEffect(() => {
    if (!session) return;
    let alive = true;
    platform
      .probe(session)
      .then((info) => {
        if (!alive || !info) return;
        if (!info.playable) setUnplayable(true);
        if (info.durationMs) setVideoDuration((d) => d ?? info.durationMs);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [session]);

  // ---------- Enregistrement ----------

  const dirty = isDirty(state);
  const save = useCallback(
    async (interactive: boolean) => {
      if (!session || !state.doc) return;
      const revision = state.revision;
      try {
        const where = await platform.saveEdit(session, serializeEdit(state.doc), interactive);
        dispatch({ type: "saved", revision });
        if (interactive && where) notify(`Montage enregistré : ${where}`);
      } catch (e) {
        notify(`Enregistrement impossible : ${String(e)}`, "error");
      }
    },
    [session, state.doc, state.revision, notify],
  );

  useEffect(() => {
    if (!dirty || state.gesture) return;
    const id = window.setTimeout(() => void save(false), AUTOSAVE_MS);
    return () => window.clearTimeout(id);
  }, [dirty, state.gesture, save]);

  const exportGroundTruth = useCallback(async () => {
    if (!session || !state.doc) return;
    const text = `${JSON.stringify(toGroundTruth({ ...state.doc, duration_ms: durationMs }), null, 2)}\n`;
    const where = await platform.saveGroundTruth(session, text).catch((e) => {
      notify(String(e), "error");
      return null;
    });
    if (where) notify(`Vérité terrain exportée : ${where}`);
  }, [session, state.doc, durationMs, notify]);

  const exportVideo = useCallback(async () => {
    if (!session || !platform.exportMontage || !montage.length) return;
    player.pause();
    setJob({ title: "Export du montage", detail: `${montage.length} points · ${duration(totalDuration(montage))}`, progress: 0 });
    try {
      const out = await platform.exportMontage(
        session,
        montage.map((c) => ({ start: c.start, end: c.end })),
        (f) => setJob((j) => (j ? { ...j, progress: f } : j)),
      );
      setJob(null);
      if (out) notify(`Montage exporté : ${out}`, "info", platform.reveal ? { label: "Afficher", run: () => void platform.reveal?.(out) } : undefined);
    } catch (e) {
      setJob(null);
      const msg = String(e);
      if (!msg.includes("annul")) notify(`Export impossible : ${msg}`, "error");
    }
  }, [session, montage, player, notify]);

  const makeProxy = useCallback(async () => {
    if (!session || !platform.makeProxy) return;
    setJob({ title: "Préparation de l'aperçu", detail: "Copie légère en H.264 pour une lecture fluide. L'export utilisera toujours l'original.", progress: 0 });
    try {
      const url = await platform.makeProxy(session, (f) => setJob((j) => (j ? { ...j, progress: f } : j)));
      setVideoUrl(url);
      setUnplayable(false);
    } catch (e) {
      const msg = String(e);
      if (!msg.includes("annul")) notify(`Aperçu impossible : ${msg}`, "error");
    } finally {
      setJob(null);
    }
  }, [session, notify]);

  // ---------- Édition ----------

  const selectedClip = clips.find((c) => c.id === state.selected) ?? null;

  const pick = useCallback(
    (c: Clip) => {
      dispatch({ type: "select", id: c.id });
      seek(c.start);
    },
    [seek],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!clips.length) return;
      const i = clips.findIndex((c) => c.id === state.selected);
      const next = clips[Math.max(0, Math.min(clips.length - 1, i < 0 ? 0 : i + dir))];
      pick(next);
    },
    [clips, state.selected, pick],
  );

  const setMode = useCallback(
    (m: Mode) => {
      player.setMode(m);
    },
    [player],
  );

  // ---------- Clavier ----------

  const keys = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keys.current = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable]")) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === "o") {
      e.preventDefault();
      void open();
      return;
    }
    if (help && e.key === "Escape") return setHelp(false);
    if (e.key === "?" || (k === "h" && !mod)) {
      setHelp((h) => !h);
      return;
    }
    if (!doc || job) return;
    const t = clock.get();
    const handled = () => e.preventDefault();
    if (mod) {
      if (k === "z" && !e.shiftKey) return handled(), dispatch({ type: "undo" });
      if ((k === "z" && e.shiftKey) || k === "y") return handled(), dispatch({ type: "redo" });
      if (k === "s") return handled(), void save(platform.kind === "web");
      return;
    }
    switch (e.key) {
      case " ":
        handled();
        player.toggle();
        return;
      case "ArrowLeft":
        handled();
        player.pause();
        seek(t - (e.shiftKey ? 1000 : FRAME_MS));
        return;
      case "ArrowRight":
        handled();
        player.pause();
        seek(t + (e.shiftKey ? 1000 : FRAME_MS));
        return;
      case "ArrowUp":
        handled();
        step(-1);
        return;
      case "ArrowDown":
        handled();
        step(1);
        return;
      case "Home":
        handled();
        if (selectedClip) seek(selectedClip.start);
        return;
      case "End":
        handled();
        if (selectedClip) seek(selectedClip.end - FRAME_MS);
        return;
      case "Delete":
      case "Backspace":
        handled();
        if (state.selected) dispatch({ type: "remove", id: state.selected });
        return;
      case "+":
      case "=":
        handled();
        timeline.current?.zoom(1 / 1.6);
        return;
      case "-":
      case "_":
        handled();
        timeline.current?.zoom(1.6);
        return;
    }
    switch (k) {
      case "k":
        if (state.selected) dispatch({ type: "toggleKeep", id: state.selected });
        return;
      case "l":
        if (player.playing) player.setRate(Math.min(4, player.rate * 2));
        else {
          player.setRate(1);
          player.play();
        }
        return;
      case "j":
        seek(t - 3000);
        return;
      case "i":
        if (selectedClip) dispatch({ type: "trim", id: selectedClip.id, edge: "start", t });
        return;
      case "o":
        if (selectedClip) dispatch({ type: "trim", id: selectedClip.id, edge: "end", t });
        return;
      case "c":
      case "s":
        dispatch({ type: "split", at: t });
        return;
      case "n":
        dispatch({ type: "add", at: t });
        return;
      case "m":
        setMode(player.mode === "rush" ? "montage" : "rush");
        return;
      case "f":
        timeline.current?.fit();
        return;
      case "a":
        setSnap((v) => !v);
        return;
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Un bouton cliqué à la souris rend le focus : Espace reste lecture / pause.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.detail > 0) (e.target as HTMLElement | null)?.closest<HTMLElement>("button")?.blur();
    };
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, []);

  // Glisser-déposer dans le navigateur
  useEffect(() => {
    if (!platform.sessionFromFiles) return;
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (!files.length) return;
      void platform.sessionFromFiles?.(files).then((s) => {
        if (s) openSession(s);
        else notify("Déposez une vidéo (avec son fichier de points .json si vous l'avez).", "error");
      });
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [openSession, notify]);

  // Avertit avant de fermer avec des modifications non enregistrées (navigateur).
  useEffect(() => {
    if (!dirty) return;
    const before = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);

  if (!session || !doc) {
    return (
      <>
        <Welcome onOpen={open} kind={platform.kind} />
        <HelpDialog open={help} onClose={() => setHelp(false)} />
        <Toasts {...toasts} />
      </>
    );
  }

  const canUndo = state.past.length > 0;
  const canRedo = state.future.length > 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Logo />
          <span className="file" title={session.path ?? session.name}>
            {session.name}
          </span>
          <span className={`save-state ${dirty ? "dirty" : ""}`}>{dirty ? "Modifié" : platform.kind === "desktop" ? "Enregistré" : "Sauvegardé dans le navigateur"}</span>
        </div>
        <ModeSwitch mode={player.mode} onChange={setMode} />
        <div className="actions">
          <button className="btn ghost" onClick={open} title="Ouvrir un autre rush (Ctrl+O)">
            <Icon name="folder" />
            Ouvrir
          </button>
          <button className="btn ghost" onClick={importPoints} title="Charger les points d'un fichier du détecteur">
            <Icon name="importFile" />
            Importer des points
          </button>
          <ExportMenu
            canVideo={!!platform.exportMontage && montage.length > 0}
            onVideo={exportVideo}
            onGroundTruth={exportGroundTruth}
            onEdit={() => void save(true)}
          />
          <button className="icon-btn" onClick={() => setHelp(true)} title="Raccourcis clavier (?)" aria-label="Raccourcis clavier">
            <Icon name="keyboard" />
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="stage">
          <div className="video-wrap">
            <video
              key={videoUrl ?? session.url}
              src={videoUrl ?? session.url}
              {...player.bind}
              muted={muted}
              preload="auto"
              playsInline
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration;
                if (Number.isFinite(d)) {
                  setVideoDuration(Math.round(d * 1000));
                  if (!doc.duration_ms) dispatch({ type: "setDuration", durationMs: Math.round(d * 1000) });
                }
              }}
              onError={() => setUnplayable(true)}
              onClick={player.toggle}
            />
            <StageBadge montage={montage} current={player.current} clips={clips} clock={clock} />
            {unplayable && (
              <div className="unplayable">
                <p className="title">Cette vidéo ne se lit pas directement ici.</p>
                {platform.makeProxy ? (
                  <>
                    <p className="muted">Son format (souvent HEVC sur iPhone) n'est pas lu par l'aperçu. On prépare une copie légère pour monter ; l'export repartira de l'original.</p>
                    <button className="btn primary" onClick={makeProxy}>
                      Préparer l'aperçu
                    </button>
                  </>
                ) : (
                  <p className="muted">Dans le navigateur, utilisez une copie MP4 en H.264 (par exemple le proxy de padel-engine). L'appli de bureau s'en charge toute seule.</p>
                )}
              </div>
            )}
          </div>
          <Transport player={player} clips={montage} durationMs={durationMs} muted={muted} onMute={() => setMuted((m) => !m)} onStep={step} />
        </section>
        <ClipList
          clips={clips}
          selected={state.selected}
          current={player.current}
          playing={player.playing}
          durationMs={durationMs}
          dispatch={dispatch}
          onPick={pick}
        />
      </main>

      <section className="timeline-panel">
        <div className="toolbar" role="toolbar" aria-label="Outils de montage">
          <div className="tool-group">
            <ToolButton icon="undo" label="Annuler" keys="Ctrl+Z" disabled={!canUndo} onClick={() => dispatch({ type: "undo" })} />
            <ToolButton icon="redo" label="Rétablir" keys="Ctrl+Maj+Z" disabled={!canRedo} onClick={() => dispatch({ type: "redo" })} />
          </div>
          <div className="tool-group">
            <ToolButton icon="inPoint" label="Début ici" keys="I" disabled={!selectedClip} onClick={() => selectedClip && dispatch({ type: "trim", id: selectedClip.id, edge: "start", t: clock.get() })} />
            <ToolButton icon="outPoint" label="Fin ici" keys="O" disabled={!selectedClip} onClick={() => selectedClip && dispatch({ type: "trim", id: selectedClip.id, edge: "end", t: clock.get() })} />
            <ToolButton icon="cut" label="Couper" keys="C" onClick={() => dispatch({ type: "split", at: clock.get() })} />
            <ToolButton icon="plus" label="Nouveau point" keys="N" onClick={() => dispatch({ type: "add", at: clock.get() })} />
            <ToolButton icon={selectedClip && !selectedClip.keep ? "eye" : "eyeOff"} label={selectedClip && !selectedClip.keep ? "Remettre dans le montage" : "Sans intérêt"} keys="K" disabled={!selectedClip} pressed={selectedClip ? !selectedClip.keep : undefined} onClick={() => selectedClip && dispatch({ type: "toggleKeep", id: selectedClip.id })} />
            <ToolButton icon="trash" label="Supprimer" keys="Suppr" disabled={!selectedClip} onClick={() => selectedClip && dispatch({ type: "remove", id: selectedClip.id })} />
          </div>
          <div className="tool-spacer">
            {selectedClip ? (
              <span className="selection-info">
                {selectedClip.keep ? `Point ${montage.indexOf(selectedClip) + 1}` : "Sans intérêt"} · {timecode(selectedClip.start)} → {timecode(selectedClip.end)} · {duration(selectedClip.end - selectedClip.start)}
              </span>
            ) : null}
            {peaksProgress !== null && (
              <span className="peaks-progress">
                <Icon name="wave" size={16} /> Forme d'onde {Math.round(peaksProgress * 100)} %
              </span>
            )}
          </div>
          <div className="tool-group">
            <ToolButton icon="magnet" label={snap ? "Aimantation activée" : "Aimantation désactivée"} keys="A · Alt pour ignorer" pressed={snap} onClick={() => setSnap((v) => !v)} />
            <ToolButton icon="zoomOut" label="Dézoomer" keys="−" onClick={() => timeline.current?.zoom(1.6)} />
            <ToolButton icon="zoomIn" label="Zoomer" keys="+" onClick={() => timeline.current?.zoom(1 / 1.6)} />
            <ToolButton icon="fit" label="Tout le match" keys="F" onClick={() => timeline.current?.fit()} />
          </div>
        </div>
        <Timeline
          ref={timeline}
          clips={clips}
          selected={state.selected}
          durationMs={durationMs}
          peaks={peaks}
          clock={clock}
          playing={player.playing}
          mode={player.mode}
          snap={snap}
          dispatch={dispatch}
          onSeek={seek}
        />
      </section>

      <HelpDialog open={help} onClose={() => setHelp(false)} />
      <JobDialog job={job} onCancel={platform.cancelJob ? () => void platform.cancelJob?.() : undefined} />
      <Toasts {...toasts} />
    </div>
  );
}

function Logo() {
  return (
    <svg className="logo" width="22" height="22" viewBox="0 0 22 22" aria-label="Padel Montage">
      <circle cx="11" cy="11" r="9" fill="var(--accent)" />
      <path d="M4.2 7.2c3.6 1 5.6 4.1 5.2 8.6M17.8 14.8c-3.6-1-5.6-4.1-5.2-8.6" stroke="#14160c" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function ModeSwitch({ mode, onChange }: { mode: Mode; onChange(m: Mode): void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Lecture" data-value={mode}>
      <span className="segmented-thumb" aria-hidden />
      <button role="radio" aria-checked={mode === "rush"} onClick={() => onChange("rush")} title="Lire le rush complet (M)">
        Rush
      </button>
      <button role="radio" aria-checked={mode === "montage"} onClick={() => onChange("montage")} title="Lire seulement les points, enchaînés (M)">
        Montage
      </button>
    </div>
  );
}

function ToolButton(props: { icon: Parameters<typeof Icon>[0]["name"]; label: string; keys?: string; disabled?: boolean; pressed?: boolean; onClick(): void }) {
  return (
    <button
      className="icon-btn tool"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-pressed={props.pressed}
      aria-label={props.label}
      data-tip={props.keys ? `${props.label} · ${props.keys}` : props.label}
    >
      <Icon name={props.icon} />
    </button>
  );
}

function ExportMenu(props: { canVideo: boolean; onVideo(): void; onGroundTruth(): void; onEdit(): void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  const run = (f: () => void) => () => {
    setOpen(false);
    f();
  };
  return (
    <div className="menu" ref={ref}>
      <button className="btn primary" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
        <Icon name="exportFile" />
        Exporter
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          <button role="menuitem" onClick={run(props.onVideo)} disabled={!props.canVideo}>
            <Icon name="film" />
            <span>
              Vidéo du montage
              <small>{platform.kind === "desktop" ? "MP4, points dans l'ordre de la liste" : "Disponible dans l'appli de bureau"}</small>
            </span>
          </button>
          <button role="menuitem" onClick={run(props.onEdit)}>
            <Icon name="save" />
            <span>
              Fichier de montage
              <small>Pour reprendre plus tard (.padel-edit.json)</small>
            </span>
          </button>
          <button role="menuitem" onClick={run(props.onGroundTruth)}>
            <Icon name="check" />
            <span>
              Vérité terrain
              <small>Vos points corrigés, pour mesurer le détecteur</small>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

function StageBadge({ montage, clips, current, clock }: { montage: Clip[]; clips: Clip[]; current: string | null; clock: ReturnType<typeof usePlayer>["clock"] }) {
  const t = useClockValue(clock);
  const i = montage.findIndex((c) => c.id === current);
  if (i < 0) {
    const excluded = clips.some((c) => !c.keep && t >= c.start && t < c.end);
    return <div className="stage-badge off">{excluded ? "Point sans intérêt, hors montage" : "Hors montage"}</div>;
  }
  return (
    <div className="stage-badge">
      Point {i + 1}
      <span className="muted"> / {montage.length}</span>
    </div>
  );
}

function Transport(props: { player: ReturnType<typeof usePlayer>; clips: Clip[]; durationMs: number; muted: boolean; onMute(): void; onStep(d: 1 | -1): void }) {
  const { player, clips, durationMs } = props;
  const t = useClockValue(player.clock);
  const offsets = useMemo(() => startOffsets(clips), [clips]);
  const total = totalDuration(clips);
  let left: string;
  let right: string;
  if (player.mode === "montage") {
    const i = clips.findIndex((c) => c.id === player.current);
    const c = clips[i];
    const m = c ? offsets[i] + Math.max(0, Math.min(t, c.end) - c.start) : 0;
    left = timecode(m);
    right = timecode(total, false);
  } else {
    left = timecode(t);
    right = timecode(durationMs, false);
  }
  return (
    <div className="transport">
      <div className="tc">
        <span className="tc-now">{left}</span>
        <span className="tc-total">/ {right}</span>
        {player.mode === "montage" ? <span className="tc-sub">rush {timecode(t)}</span> : null}
      </div>
      <div className="transport-main">
        <button className="icon-btn" onClick={() => props.onStep(-1)} aria-label="Point précédent" data-tip="Point précédent · ↑">
          <Icon name="prev" />
        </button>
        <button className="play" onClick={player.toggle} aria-label={player.playing ? "Pause" : "Lecture"} data-tip={player.playing ? "Pause · Espace" : "Lecture · Espace"}>
          <Icon name={player.playing ? "pause" : "play"} size={20} />
        </button>
        <button className="icon-btn" onClick={() => props.onStep(1)} aria-label="Point suivant" data-tip="Point suivant · ↓">
          <Icon name="next" />
        </button>
      </div>
      <div className="transport-side">
        <button className="rate" onClick={() => player.setRate(player.rate >= 2 ? 1 : player.rate === 1 ? 1.5 : 2)} title="Vitesse de lecture">
          {String(player.rate).replace(".", ",")}×
        </button>
        <button className="icon-btn" onClick={props.onMute} aria-label={props.muted ? "Activer le son" : "Couper le son"}>
          <Icon name={props.muted ? "mute" : "volume"} />
        </button>
      </div>
    </div>
  );
}
