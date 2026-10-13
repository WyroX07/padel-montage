"""Détecteur v0 : impacts de balle à l'oreille, regroupés en points.

Pas d'apprentissage. Sert de base de mesure et de pré-annotation.
1. Flux spectral positif dans la bande 1,5-10 kHz (attaques sèches des frappes).
2. Normalisation robuste locale (médiane et MAD glissantes sur 2 s).
3. Pics au-dessus d'un seuil, espacés d'au moins 150 ms.
4. Pics séparés de moins de ``max_gap_s`` regroupés en un point.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.ndimage import median_filter
from scipy.signal import find_peaks, stft

from .annotations import Rally, RallySet

SR = 24_000
HOP = 120  # 5 ms
WIN = 512


@dataclass
class AudioV0Params:
    threshold: float = 12.0
    max_gap_s: float = 2.5
    min_hits: int = 4
    pre_s: float = 0.3
    post_s: float = 1.0


def onset_strength(wav_path: str | Path) -> tuple[np.ndarray, float]:
    """Force d'attaque normalisée (une valeur toutes les 5 ms) et sa fréquence."""
    sr, x = wavfile.read(str(wav_path), mmap=True)
    if sr != SR:
        raise ValueError(
            f"audio attendu à {SR} Hz, reçu {sr} Hz (utiliser `padel-engine audio --rate {SR}`)"
        )
    if x.ndim > 1:
        x = x.mean(axis=1)
    chunk = SR * 60
    parts: list[np.ndarray] = []
    prev = None
    for s in range(0, len(x), chunk):
        seg = np.asarray(x[s : s + chunk], dtype=np.float32) / 32768
        f, _, z = stft(seg, SR, nperseg=WIN, noverlap=WIN - HOP, boundary=None, padded=False)
        spec = np.log1p(100 * np.abs(z[(f > 1500) & (f < 10_000)])).astype(np.float32)
        if prev is None:
            spec = np.concatenate([spec[:, :1], spec], axis=1)
        else:
            spec = np.concatenate([prev, spec], axis=1)
        parts.append(np.maximum(0, np.diff(spec, axis=1)).sum(0))
        prev = spec[:, -1:]
    flux = np.concatenate(parts)
    rate = SR / HOP
    win = int(rate * 2)
    base = median_filter(flux, size=win)
    mad = median_filter(np.abs(flux - base), size=win) + 1e-6
    return (flux - base) / mad, rate


def detect_hits(strength: np.ndarray, rate: float, threshold: float) -> np.ndarray:
    """Instants (s) et force des impacts candidats, tableau (n, 2)."""
    peaks, _ = find_peaks(strength, height=threshold, distance=int(0.15 * rate))
    return np.stack([peaks / rate, strength[peaks]], axis=1)


def group_rallies(hits_s: np.ndarray, p: AudioV0Params, duration_ms: int | None) -> list[Rally]:
    groups: list[list[float]] = []
    for t in hits_s:
        if groups and t - groups[-1][-1] <= p.max_gap_s:
            groups[-1].append(float(t))
        else:
            groups.append([float(t)])
    rallies: list[Rally] = []
    for g in groups:
        if len(g) < p.min_hits:
            continue
        start = max(0, round((g[0] - p.pre_s) * 1000))
        end = round((g[-1] + p.post_s) * 1000)
        if duration_ms is not None:
            end = min(end, duration_ms)
        hits = [round(t * 1000) for t in g]
        if rallies and start <= rallies[-1].end_ms:
            prev = rallies.pop()
            start, hits = prev.start_ms, prev.hits + hits
        rallies.append(Rally(start, end, hits=hits, confidence=min(1.0, len(hits) / 10)))
    return rallies


def detect(
    wav_path: str | Path,
    video: str,
    camera: str = "autre",
    duration_ms: int | None = None,
    params: AudioV0Params | None = None,
) -> RallySet:
    p = params or AudioV0Params()
    strength, rate = onset_strength(wav_path)
    hits = detect_hits(strength, rate, p.threshold)
    rallies = group_rallies(hits[:, 0], p, duration_ms)
    return RallySet(video, camera, duration_ms, rallies, "prediction")
