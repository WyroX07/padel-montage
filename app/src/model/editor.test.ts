import { describe, expect, it } from "vitest";
import { emptyDoc, type Clip } from "./edit";
import { initialState, isDirty, reducer, type Action, type EditorState } from "./editor";

const clip = (id: string, start: number, end: number): Clip => ({ id, start, end, origin: "detection", hits: [], keep: true });
const loaded = () =>
  reducer(initialState, { type: "load", doc: { ...emptyDoc("m.mp4", 60000), clips: [clip("a", 1000, 5000), clip("b", 8000, 12000)] } });
const run = (s: EditorState, ...actions: Action[]) => actions.reduce(reducer, s);

describe("éditeur", () => {
  it("annule et rétablit", () => {
    const s = run(loaded(), { type: "remove", id: "a" });
    expect(s.doc!.clips.map((c) => c.id)).toEqual(["b"]);
    expect(isDirty(s)).toBe(true);
    const u = run(s, { type: "undo" });
    expect(u.doc!.clips.map((c) => c.id)).toEqual(["a", "b"]);
    expect(run(u, { type: "redo" }).doc!.clips.map((c) => c.id)).toEqual(["b"]);
  });

  it("une glisse ne compte que pour une étape d'historique", () => {
    const s = run(
      loaded(),
      { type: "gestureStart" },
      { type: "trim", id: "a", edge: "end", t: 5500 },
      { type: "trim", id: "a", edge: "end", t: 6000 },
      { type: "trim", id: "a", edge: "end", t: 6500 },
      { type: "gestureEnd" },
    );
    expect(s.doc!.clips[0].end).toBe(6500);
    expect(s.past).toHaveLength(1);
    expect(run(s, { type: "undo" }).doc!.clips[0].end).toBe(5000);
  });

  it("une glisse sans effet ne laisse pas de trace", () => {
    const s = run(loaded(), { type: "gestureStart" }, { type: "gestureEnd" });
    expect(s.past).toHaveLength(0);
  });

  it("sélectionne le voisin après suppression et la seconde moitié après coupe", () => {
    const s = run(loaded(), { type: "select", id: "a" }, { type: "remove", id: "a" });
    expect(s.selected).toBe("b");
    const c = run(loaded(), { type: "split", at: 10000 });
    expect(c.doc!.clips).toHaveLength(3);
    expect(c.selected).toBe(c.doc!.clips[2].id);
  });

  it("l'enregistrement remet l'état à jour", () => {
    const s = run(loaded(), { type: "add", at: 30000 });
    expect(isDirty(run(s, { type: "saved", revision: s.revision }))).toBe(false);
  });
});

describe("sans intérêt", () => {
  it("sort du montage, reste dans la vérité terrain avec keep: false", async () => {
    const { kept } = await import("./ops");
    const { toGroundTruth } = await import("./edit");
    const s = run(loaded(), { type: "toggleKeep", id: "a" });
    expect(kept(s.doc!.clips).map((c) => c.id)).toEqual(["b"]);
    expect(toGroundTruth(s.doc!).rallies.map((r) => r.keep)).toEqual([false, undefined]);
    expect(run(s, { type: "undo" }).doc!.clips[0].keep).toBe(true);
  });
});
