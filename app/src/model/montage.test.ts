import { describe, expect, it } from "vitest";
import type { Clip } from "./edit";
import { advance, fromMontage, toMontage } from "./montage";

const clip = (id: string, start: number, end: number): Clip => ({ id, start, end, origin: "detection", hits: [], keep: true });
// Ordre du montage différent de l'ordre du rush.
const clips = [clip("b", 10000, 14000), clip("a", 1000, 3000)];

describe("montage", () => {
  it("convertit dans les deux sens", () => {
    expect(toMontage(clips, 11000)).toBe(1000);
    expect(toMontage(clips, 2000)).toBe(5000);
    expect(toMontage(clips, 6000)).toBeNull();
    expect(fromMontage(clips, 4500)).toEqual({ index: 1, t: 1500 });
    expect(fromMontage(clips, 99999)).toEqual({ index: 1, t: 3000 });
  });

  it("enchaîne les points pendant la lecture", () => {
    expect(advance(clips, 0, 12000)).toBeNull();
    expect(advance(clips, 0, 14000)).toEqual({ index: 1, t: 1000 });
    expect(advance(clips, 1, 3000)).toBe("end");
  });
});
