import { DEFAULT_CONFIG, type Team, scoreBeforeEachPoint } from "@padel/score";
import { describe, expect, it } from "vitest";
import { overlayFrames } from "../src/frames";

describe("overlayFrames", () => {
  it("une image par score distinct", () => {
    const winners = [..."AAAA"] as Team[];
    const snaps = scoreBeforeEachPoint(DEFAULT_CONFIG, winners);
    expect(snaps).toHaveLength(5);
    const frames = overlayFrames(DEFAULT_CONFIG, snaps);
    // 0-0, 15-0, 30-0, 40-0, puis 1-0 jeux : 5 états différents.
    expect(frames.map((f) => f.indexes)).toEqual([[0], [1], [2], [3], [4]]);
  });

  it("deux instantanés identiques partagent une image", () => {
    const snaps = scoreBeforeEachPoint(DEFAULT_CONFIG, ["A"]);
    const frames = overlayFrames(DEFAULT_CONFIG, [snaps[0]!, snaps[1]!, snaps[0]!]);
    expect(frames.map((f) => f.indexes)).toEqual([[0, 2], [1]]);
  });
});
