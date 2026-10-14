import { describe, expect, it } from "vitest";
import type { Clip } from "./edit";
import * as ops from "./ops";

const clip = (id: string, start: number, end: number, hits: number[] = []): Clip => ({ id, start, end, origin: "detection", hits, keep: true });
const base = () => [clip("a", 1000, 5000, [1500, 3000]), clip("b", 8000, 12000), clip("c", 20000, 26000)];

describe("trim", () => {
  it("ne dépasse ni les voisins ni la durée minimale", () => {
    expect(ops.trim(base(), "b", "start", 2000, null)[1].start).toBe(5000);
    expect(ops.trim(base(), "b", "end", 30000, null)[1].end).toBe(20000);
    expect(ops.trim(base(), "b", "start", 11900, null)[1].start).toBe(12000 - ops.MIN_CLIP_MS);
    expect(ops.trim(base(), "c", "end", 99000, 27000)[2].end).toBe(27000);
    expect(ops.trim(base(), "a", "start", -500, null)[0].start).toBe(0);
  });

  it("renvoie la même liste si rien ne change", () => {
    const clips = base();
    expect(ops.trim(clips, "a", "start", 1000, null)[0]).toBe(clips[0]);
  });
});

describe("slide", () => {
  it("garde la durée, déplace les coups et reste entre les voisins", () => {
    const r = ops.slide(base(), "a", 2000, null)[0];
    expect([r.start, r.end, r.hits]).toEqual([2000, 6000, [2500, 4000]]);
    const blocked = ops.slide(base(), "a", 6000, null)[0];
    expect([blocked.start, blocked.end]).toEqual([4000, 8000]);
  });
});

describe("split", () => {
  it("coupe en deux points qui se suivent et répartit les coups", () => {
    const r = ops.split(base(), "a", 2000);
    expect(r.clips.map((c) => [c.start, c.end])).toEqual([
      [1000, 2000],
      [2000, 5000],
      [8000, 12000],
      [20000, 26000],
    ]);
    expect(r.clips[0].hits).toEqual([1500]);
    expect(r.clips[1].hits).toEqual([3000]);
    expect(r.second).toBe(r.clips[1].id);
  });

  it("refuse une coupe trop près d'un bord", () => {
    expect(ops.split(base(), "a", 1100).second).toBeNull();
  });
});

describe("add", () => {
  it("place un nouveau point dans le trou, à sa place dans le montage", () => {
    const r = ops.add(base(), 13000, null);
    const i = r.clips.findIndex((c) => c.id === r.id);
    expect(i).toBe(2);
    expect([r.clips[i].start, r.clips[i].end, r.clips[i].origin]).toEqual([13000, 20000, "manuel"]);
  });

  it("ne crée rien à l'intérieur d'un point", () => {
    expect(ops.add(base(), 3000, null).id).toBeNull();
  });
});

describe("reorder", () => {
  it("déplace un point dans le montage", () => {
    expect(ops.reorder(base(), "c", 0).map((c) => c.id)).toEqual(["c", "a", "b"]);
    expect(ops.isChronological(ops.reorder(base(), "c", 0))).toBe(false);
    expect(ops.sortChronological(ops.reorder(base(), "c", 0)).map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
});
