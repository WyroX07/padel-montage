import { describe, expect, it } from "vitest";
import { FormatError, parseDocument, serializeEdit, toGroundTruth } from "./edit";

const rallies = {
  format: "padel-rallies/v1",
  video: "match.MOV",
  camera: "trepied_vitre",
  duration_ms: 60000,
  source: "prediction",
  rallies: [
    { start_ms: 9000, end_ms: 12000, hits: [9100, 11000], confidence: 0.8 },
    { start_ms: 1000, end_ms: 4000, hits: [] },
    { start_ms: 5000, end_ms: 5000 },
  ],
};

describe("formats", () => {
  it("lit les segments du détecteur, triés, sans les segments vides", () => {
    const d = parseDocument(JSON.stringify(rallies), "x.mp4");
    expect(d.clips.map((c) => [c.start, c.end])).toEqual([
      [1000, 4000],
      [9000, 12000],
    ]);
    expect(d.clips[1].confidence).toBe(0.8);
    expect(d.video).toBe("match.MOV");
  });

  it("relit un montage enregistré à l'identique", () => {
    const d = parseDocument(JSON.stringify(rallies), "x.mp4");
    const again = parseDocument(serializeEdit(d), "x.mp4");
    expect(again).toEqual(d);
  });

  it("réécrit le montage en vérité terrain triée", () => {
    const d = parseDocument(JSON.stringify(rallies), "x.mp4");
    const gt = toGroundTruth({ ...d, clips: [...d.clips].reverse() });
    expect(gt.source).toBe("ground_truth");
    expect(gt.rallies.map((r) => r.start_ms)).toEqual([1000, 9000]);
  });

  it("refuse un format inconnu", () => {
    expect(() => parseDocument('{"format":"autre"}', "x")).toThrow(FormatError);
    expect(() => parseDocument("pas du json", "x")).toThrow(FormatError);
  });
});
