import { describe, expect, it } from "vitest";
import { PeakBuilder, parseWavHeader, peaksFromWavFile } from "./peaks";

function wav(samples: number[], rate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, s, true));
  return buf;
}

describe("forme d'onde", () => {
  it("un pic par tranche de 10 ms", () => {
    const b = new PeakBuilder(1000);
    b.push(Int16Array.from([0, 100, -32768, 0, 0, 0, 0, 0, 0, 0, 16384, 0]));
    expect(Array.from(b.finish().values)).toEqual([255, 128]);
  });

  it("lit un WAV PCM 16 bits", async () => {
    const buf = wav([0, 32767, 0, 0, 0, 0, 0, 0, 0, 0], 1000);
    expect(parseWavHeader(buf)).toMatchObject({ channels: 1, sampleRate: 1000, dataOffset: 44 });
    const p = await peaksFromWavFile(new Blob([buf]));
    expect(Array.from(p.values)).toEqual([255]);
  });
});
