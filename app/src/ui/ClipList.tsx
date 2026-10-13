// Liste des points dans l'ordre du montage. On la réordonne en tirant la poignée.

import { memo, useEffect, useRef, useState } from "react";
import type { Dispatch } from "react";
import type { Clip } from "../model/edit";
import type { Action } from "../model/editor";
import { isChronological, kept, totalDuration } from "../model/ops";
import { duration, timecode } from "../model/time";
import { Icon } from "./icons";

interface Props {
  clips: Clip[];
  selected: string | null;
  current: string | null;
  playing: boolean;
  durationMs: number;
  dispatch: Dispatch<Action>;
  onPick(clip: Clip): void;
}

const ROW_H = 52;

export const ClipList = memo(function ClipList({ clips, selected, current, playing, durationMs, dispatch, onPick }: Props) {
  const listRef = useRef<HTMLOListElement>(null);
  const [dragging, setDragging] = useState<{ id: string; to: number } | null>(null);
  const showConfidence = clips.some((c) => c.confidence !== undefined && c.confidence < 0.999);

  useEffect(() => {
    if (!selected || dragging) return;
    listRef.current?.querySelector<HTMLElement>(`[data-id="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected, dragging]);

  const targetIndex = (clientY: number) => {
    const r = listRef.current!.getBoundingClientRect();
    const y = clientY - r.top + listRef.current!.scrollTop;
    return Math.max(0, Math.min(clips.length, Math.round(y / ROW_H)));
  };

  const montage = kept(clips);
  const numbers = new Map(montage.map((c, i) => [c.id, i + 1]));
  const total = totalDuration(montage);
  const excluded = clips.length - montage.length;
  const share = durationMs ? Math.round((total / durationMs) * 100) : 0;

  return (
    <aside className="clips" aria-label="Points du montage">
      <header className="clips-head">
        <div>
          <h2>Points</h2>
          <p className="muted">
            {montage.length} · {duration(total)}
            {durationMs ? ` · ${share} % du rush` : ""}
            {excluded ? ` · ${excluded} sans intérêt` : ""}
          </p>
        </div>
        {!isChronological(clips) && (
          <button className="btn ghost small" onClick={() => dispatch({ type: "sortChronological" })} title="Remettre les points dans l'ordre du match">
            <Icon name="sort" size={16} />
            Ordre du match
          </button>
        )}
      </header>
      {clips.length === 0 ? (
        <div className="clips-empty">
          <p>Aucun point pour l'instant.</p>
          <p className="muted">
            Importez le fichier du détecteur, ou placez la tête de lecture et appuyez sur <kbd>N</kbd>.
          </p>
        </div>
      ) : (
        <ol ref={listRef} className="clips-list" data-dragging={dragging ? "" : undefined}>
          {clips.map((c, i) => {
            const isSel = c.id === selected;
            const isCur = c.id === current;
            const n = numbers.get(c.id);
            return (
              <li
                key={c.id}
                data-id={c.id}
                className="clip-row"
                aria-selected={isSel}
                data-current={isCur || undefined}
                data-excluded={!c.keep || undefined}
                data-dragged={dragging?.id === c.id || undefined}
                onClick={() => onPick(c)}
                style={{ height: ROW_H }}
              >
                <span
                  className="grip"
                  title="Glisser pour déplacer dans le montage"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDragging({ id: c.id, to: i });
                  }}
                  onPointerMove={(e) => {
                    if (dragging?.id === c.id) setDragging({ id: c.id, to: targetIndex(e.clientY) });
                  }}
                  onPointerUp={() => {
                    if (dragging?.id === c.id) {
                      const to = dragging.to > i ? dragging.to - 1 : dragging.to;
                      if (to !== i) dispatch({ type: "reorder", id: c.id, to });
                    }
                    setDragging(null);
                  }}
                  onPointerCancel={() => setDragging(null)}
                >
                  <Icon name="grip" size={16} />
                </span>
                <span className="clip-num">{isCur && playing ? <span className="eq" aria-label="en lecture"><i /><i /><i /></span> : (n ?? "–")}</span>
                <span className="clip-main">
                  <span className="clip-time">
                    {timecode(c.start, false)} <span className="arrow">→</span> {timecode(c.end, false)}
                  </span>
                  <span className="clip-meta">
                    {c.origin === "manuel" ? <span className="tag manual">ajouté</span> : null}
                    {!c.keep ? <span className="tag excluded">sans intérêt</span> : null}
                    {c.hits.length ? <span>{c.hits.length} coups</span> : null}
                    {showConfidence && c.confidence !== undefined ? (
                      <span className="conf" title={`Confiance du détecteur : ${Math.round(c.confidence * 100)} %`}>
                        <span style={{ transform: `scaleX(${c.confidence})` }} />
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="clip-dur">{duration(c.end - c.start)}</span>
                <button
                  className="icon-btn row-keep"
                  title={c.keep ? "Sans intérêt : garder hors du montage (K)" : "Remettre dans le montage (K)"}
                  aria-label={c.keep ? "Marquer sans intérêt" : "Remettre dans le montage"}
                  aria-pressed={!c.keep}
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: "toggleKeep", id: c.id });
                  }}
                >
                  <Icon name={c.keep ? "eye" : "eyeOff"} size={16} />
                </button>
                <button
                  className="icon-btn row-del"
                  title="Supprimer ce point (Suppr)"
                  aria-label={`Supprimer le point ${n ?? i + 1}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: "remove", id: c.id });
                  }}
                >
                  <Icon name="trash" size={16} />
                </button>
              </li>
            );
          })}
          {dragging && <li className="drop-line" style={{ transform: `translateY(${dragging.to * ROW_H - 1}px)` }} aria-hidden />}
        </ol>
      )}
    </aside>
  );
});
