// Affichage des durées et des instants.

const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, "0");

/** 1:02:03.4 ou 12:03.4 (dixièmes). */
export function timecode(ms: number, tenths = true): string {
  const neg = ms < 0;
  const t = Math.abs(ms);
  const h = Math.floor(t / 3_600_000);
  const m = Math.floor((t % 3_600_000) / 60_000);
  const s = Math.floor((t % 60_000) / 1000);
  const d = Math.floor((t % 1000) / 100);
  const body = h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  return `${neg ? "−" : ""}${body}${tenths ? `.${d}` : ""}`;
}

/** « 8,4 s », « 2 min 05 », « 1 h 02 ». */
export function duration(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1).replace(".", ",")} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${pad(s % 60)}`;
  return `${Math.floor(m / 60)} h ${pad(m % 60)}`;
}

/** Pas des graduations de la règle : le plus petit qui laisse `minPx` entre deux. */
export function rulerStep(msPerPx: number, minPx = 84): number {
  const steps = [100, 250, 500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000, 3_600_000];
  return steps.find((s) => s / msPerPx >= minPx) ?? steps[steps.length - 1];
}
