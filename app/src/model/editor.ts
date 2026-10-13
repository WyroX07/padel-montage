// État de l'éditeur : le montage, la sélection et l'historique (annuler / rétablir).

import type { Clip, EditDoc } from "./edit";
import * as ops from "./ops";

const HISTORY_LIMIT = 200;

export interface EditorState {
  doc: EditDoc | null;
  selected: string | null;
  past: Clip[][];
  future: Clip[][];
  /** Une glisse est en cours : ses étapes ne s'empilent pas dans l'historique. */
  gesture: Clip[] | null;
  /** Nombre de modifications depuis le dernier enregistrement. */
  revision: number;
  savedRevision: number;
}

export const initialState: EditorState = {
  doc: null,
  selected: null,
  past: [],
  future: [],
  gesture: null,
  revision: 0,
  savedRevision: 0,
};

export type Action =
  | { type: "load"; doc: EditDoc }
  | { type: "setDuration"; durationMs: number }
  | { type: "select"; id: string | null }
  | { type: "gestureStart" }
  | { type: "gestureEnd" }
  | { type: "trim"; id: string; edge: ops.Edge; t: number }
  | { type: "slide"; id: string; start: number }
  | { type: "split"; at: number; id?: string }
  | { type: "remove"; id: string }
  | { type: "add"; at: number }
  | { type: "reorder"; id: string; to: number }
  | { type: "sortChronological" }
  | { type: "toggleKeep"; id: string }
  | { type: "replace"; clips: Clip[] }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "saved"; revision: number };

function commit(state: EditorState, clips: Clip[], selected = state.selected): EditorState {
  const doc = state.doc;
  if (!doc || clips === doc.clips) return selected === state.selected ? state : { ...state, selected };
  const next = { ...state, doc: { ...doc, clips }, selected, revision: state.revision + 1 };
  if (state.gesture) return next;
  return { ...next, past: [...state.past, doc.clips].slice(-HISTORY_LIMIT), future: [] };
}

export function reducer(state: EditorState, action: Action): EditorState {
  const doc = state.doc;
  switch (action.type) {
    case "load":
      return { ...initialState, doc: action.doc, selected: action.doc.clips[0]?.id ?? null };
    case "setDuration":
      if (!doc || doc.duration_ms === action.durationMs) return state;
      return { ...state, doc: { ...doc, duration_ms: action.durationMs } };
    case "select":
      return action.id === state.selected ? state : { ...state, selected: action.id };
    case "saved":
      return { ...state, savedRevision: action.revision };
  }
  if (!doc) return state;
  const clips = doc.clips;
  const dur = doc.duration_ms;
  switch (action.type) {
    case "gestureStart":
      return state.gesture ? state : { ...state, gesture: clips };
    case "gestureEnd": {
      const before = state.gesture;
      if (!before) return state;
      if (before === clips) return { ...state, gesture: null };
      return {
        ...state,
        gesture: null,
        past: [...state.past, before].slice(-HISTORY_LIMIT),
        future: [],
      };
    }
    case "trim":
      return commit(state, ops.trim(clips, action.id, action.edge, action.t, dur), action.id);
    case "slide":
      return commit(state, ops.slide(clips, action.id, action.start, dur), action.id);
    case "split": {
      const target = action.id ?? ops.clipAt(clips, action.at)?.id;
      if (!target) return state;
      const r = ops.split(clips, target, action.at);
      return r.second ? commit(state, r.clips, r.second) : state;
    }
    case "remove": {
      const i = clips.findIndex((c) => c.id === action.id);
      if (i < 0) return state;
      const next = ops.remove(clips, action.id);
      const neighbour = next[Math.min(i, next.length - 1)]?.id ?? null;
      return commit(state, next, state.selected === action.id ? neighbour : state.selected);
    }
    case "add": {
      const r = ops.add(clips, action.at, dur);
      return r.id ? commit(state, r.clips, r.id) : state;
    }
    case "reorder":
      return commit(state, ops.reorder(clips, action.id, action.to));
    case "toggleKeep":
      return commit(state, ops.toggleKeep(clips, action.id));
    case "replace":
      return commit(state, action.clips, action.clips[0]?.id ?? null);
    case "sortChronological":
      return ops.isChronological(clips) ? state : commit(state, ops.sortChronological(clips));
    case "undo": {
      const prev = state.past.at(-1);
      if (!prev || state.gesture) return state;
      return {
        ...state,
        doc: { ...doc, clips: prev },
        past: state.past.slice(0, -1),
        future: [clips, ...state.future],
        selected: keepSelection(prev, state.selected),
        revision: state.revision + 1,
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next || state.gesture) return state;
      return {
        ...state,
        doc: { ...doc, clips: next },
        past: [...state.past, clips],
        future: state.future.slice(1),
        selected: keepSelection(next, state.selected),
        revision: state.revision + 1,
      };
    }
  }
}

const keepSelection = (clips: Clip[], id: string | null) =>
  id && clips.some((c) => c.id === id) ? id : (clips[0]?.id ?? null);

export const isDirty = (s: EditorState) => s.revision !== s.savedRevision;
