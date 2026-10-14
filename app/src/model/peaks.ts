// Forme d'onde réduite : un pic d'amplitude (0-255) par tranche de `binMs`.
// Dans l'appli de bureau, c'est FFmpeg (côté Rust) qui la calcule depuis la vidéo ;
// dans le navigateur, on la lit depuis un WAV PCM 16 bits posé à côté du rush.

export interface Peaks {
  binMs: number;
  values: Uint8Array;
}

export const PEAK_BIN_MS = 10;

/** Accumule des échantillons 16 bits mono en pics, morceau par morceau. */
export class PeakBuilder {
  private readonly samplesPerBin: number;
  private readonly out: number[] = [];
  private count = 0;
  private max = 0;

  constructor(
    sampleRate: number,
    private readonly binMs = PEAK_BIN_MS,
  ) {
    this.samplesPerBin = Math.max(1, Math.round((sampleRate * binMs) / 1000));
  }

  push(samples: Int16Array, channels = 1): void {
    for (let i = 0; i < samples.length; i += channels) {
      let v = 0;
      for (let ch = 0; ch < channels; ch++) v = Math.max(v, Math.abs(samples[i + ch] ?? 0));
      if (v > this.max) this.max = v;
      if (++this.count === this.samplesPerBin) this.flush();
    }
  }

  private flush(): void {
    this.out.push(Math.min(255, Math.round((this.max / 32768) * 255)));
    this.count = 0;
    this.max = 0;
  }

  finish(): Peaks {
    if (this.count) this.flush();
    return { binMs: this.binMs, values: Uint8Array.from(this.out) };
  }
}

interface WavFormat {
  channels: number;
  sampleRate: number;
  dataOffset: number;
  dataLength: number;
}

export function parseWavHeader(buf: ArrayBuffer): WavFormat {
  const v = new DataView(buf);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("Ce fichier n'est pas un WAV.");
  let o = 12;
  let fmt: Omit<WavFormat, "dataOffset" | "dataLength"> | null = null;
  while (o + 8 <= v.byteLength) {
    const id = tag(o);
    const size = v.getUint32(o + 4, true);
    if (id === "fmt ") {
      const audioFormat = v.getUint16(o + 8, true);
      const bits = v.getUint16(o + 22, true);
      if ((audioFormat !== 1 && audioFormat !== 0xfffe) || bits !== 16) {
        throw new Error("Seuls les WAV PCM 16 bits sont lus.");
      }
      fmt = { channels: v.getUint16(o + 10, true), sampleRate: v.getUint32(o + 12, true) };
    } else if (id === "data") {
      if (!fmt) throw new Error("WAV sans en-tête de format.");
      return { ...fmt, dataOffset: o + 8, dataLength: size };
    }
    o += 8 + size + (size % 2);
  }
  throw new Error("WAV sans données audio.");
}

/** Lit un WAV par morceaux de 4 Mo, sans le charger entièrement en mémoire. */
export async function peaksFromWavFile(file: Blob, onProgress?: (f: number) => void): Promise<Peaks> {
  const head = await file.slice(0, 1 << 16).arrayBuffer();
  const fmt = parseWavHeader(head);
  const builder = new PeakBuilder(fmt.sampleRate);
  const end = Math.min(file.size, fmt.dataOffset + fmt.dataLength);
  const frame = 2 * fmt.channels;
  const chunk = (1 << 22) - ((1 << 22) % frame);
  for (let o = fmt.dataOffset; o < end; o += chunk) {
    const buf = await file.slice(o, Math.min(end, o + chunk)).arrayBuffer();
    builder.push(new Int16Array(buf, 0, Math.floor(buf.byteLength / 2)), fmt.channels);
    onProgress?.((o - fmt.dataOffset) / (end - fmt.dataOffset));
  }
  return builder.finish();
}
