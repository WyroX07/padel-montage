"""Détecteur v2 : probabilité « en jeu » apprise (image + son), puis découpage calé sur les frappes.

1. Par image (5 im/s) : joueurs proches et lointains (nombre, position des pieds, écart,
   vitesse en hauteurs de corps par seconde), force d'attaque du son et frappes.
2. Agrégats sur fenêtres glissantes de 1, 3 et 6 s (moyenne, max, passé seul, futur seul).
3. Classifieur (gradient boosting) appris sur la vérité terrain : P(en jeu) par image.
4. Hystérésis sur P lissée, fusion des trous courts, puis bornes calées sur la première et la
   dernière frappe entendue dans le segment.

La géométrie du terrain (``Court``) est en pixels 960x540 et réglée pour un trépied derrière
la vitre du fond ; un autre cadrage demandera un calibrage du terrain.
"""

from __future__ import annotations

import pickle
from dataclasses import asdict, dataclass, field
from pathlib import Path

import numpy as np
from scipy.ndimage import maximum_filter1d, uniform_filter1d

from .annotations import Rally, RallySet

FPS = 5.0
AUDIO_RATE = 200.0  # valeurs de force d'attaque par seconde (detect_audio.HOP = 5 ms)


@dataclass(frozen=True)
class Court:
    """Zones du terrain en pixels 960x540."""

    left_wall: tuple[float, float, float] = (290.0, -62 / 300, 0.0)  # y = a + b * (x - c)
    right_wall: tuple[float, float, float] = (220.0, 30 / 230, 730.0)
    near_min_h: float = 80.0
    far_x: tuple[float, float] = (360.0, 700.0)
    far_foot_y: tuple[float, float] = (195.0, 245.0)
    far_h: tuple[float, float] = (20.0, 80.0)


@dataclass
class V2Params:
    thr_on: float = 0.6
    thr_off: float = 0.4
    min_len_s: float = 2.0
    merge_gap_s: float = 1.5
    pre_s: float = 0.3
    post_s: float = 2.0
    min_hits: int = 3
    smooth_s: float = 1.0
    hit_threshold: float = 12.0


@dataclass
class V2Model:
    classifier: object
    feature_names: list[str]
    params: V2Params = field(default_factory=V2Params)
    court: Court = field(default_factory=Court)

    def save(self, path: str | Path) -> None:
        with open(path, "wb") as f:
            pickle.dump(self, f)

    @staticmethod
    def load(path: str | Path) -> V2Model:
        # Fichier produit par `padel-engine train-v2` : ne charger que ses propres modèles.
        with open(path, "rb") as f:
            return pickle.load(f)


def _wall_y(line: tuple[float, float, float], x: float) -> float:
    a, b, c = line
    return a + b * (x - c)


def split_players(
    boxes: np.ndarray,
    n: int,
    court: Court = Court(),  # noqa: B008
) -> tuple[list[np.ndarray], list[np.ndarray]]:
    """Joueurs proches et lointains par image : tableaux (k <= 2, 4) x_pied, y_pied, h, score."""
    near: list[list[tuple]] = [[] for _ in range(n)]
    far: list[list[tuple]] = [[] for _ in range(n)]
    for i, x1, y1, x2, y2, sc, src in boxes:
        i = int(i)
        xc, yb, h = (x1 + x2) / 2, y2, y2 - y1
        if src == 0 and sc > 0.4 and h > court.near_min_h:
            inside = yb > _wall_y(court.left_wall, xc) and yb > _wall_y(court.right_wall, xc)
            if inside or yb > 300:
                near[i].append((xc, yb, h, sc))
        elif (
            src == 1
            and sc > 0.3
            and court.far_foot_y[0] <= yb <= court.far_foot_y[1]
            and court.far_x[0] <= xc <= court.far_x[1]
            and court.far_h[0] <= h <= court.far_h[1]
        ):
            far[i].append((xc, yb, h, sc))
    far_kept = []
    for lst in far:  # doublons de la passe zoomée
        keep: list[tuple] = []
        for r in sorted(lst, key=lambda r: -r[3]):
            if all(abs(r[0] - k[0]) > 0.2 * r[2] for k in keep):
                keep.append(r)
        far_kept.append(keep[:2])
    near_kept = [sorted(lst, key=lambda r: -r[3])[:2] for lst in near]
    as_arr = [np.array(x, float).reshape(-1, 4) for x in near_kept]
    return as_arr, [np.array(x, float).reshape(-1, 4) for x in far_kept]


def speeds(frames: list[np.ndarray]) -> tuple[np.ndarray, np.ndarray]:
    """Vitesse moyenne et max des pieds (hauteurs de corps / s), appariement glouton."""
    n = len(frames)
    mean, mx = np.zeros(n), np.zeros(n)
    for i in range(1, n):
        a, b = frames[i - 1], frames[i]
        if len(a) == 0 or len(b) == 0:
            continue
        d = np.hypot(a[:, None, 0] - b[None, :, 0], a[:, None, 1] - b[None, :, 1])
        v = d / ((a[:, None, 2] + b[None, :, 2]) / 2) * FPS
        vs = []
        for _ in range(min(len(a), len(b))):
            j = np.unravel_index(np.argmin(v), v.shape)
            if v[j] > 20:
                break
            vs.append(v[j])
            v[j[0], :] = np.inf
            v[:, j[1]] = np.inf
        if vs:
            mean[i], mx[i] = np.mean(vs), np.max(vs)
    return mean, mx


def hit_times(strength: np.ndarray, threshold: float) -> np.ndarray:
    from .detect_audio import detect_hits

    return detect_hits(strength, AUDIO_RATE, threshold)[:, 0]


def frame_features(
    t: np.ndarray, boxes: np.ndarray, strength: np.ndarray, p: V2Params, court: Court
) -> dict[str, np.ndarray]:
    n = len(t)
    near, far = split_players(boxes, n, court)
    f: dict[str, np.ndarray] = {
        "n_near": np.array([len(x) for x in near], float),
        "n_far": np.array([len(x) for x in far], float),
    }
    for name, fr in (("near", near), ("far", far)):
        f[f"{name}_y"] = np.array([x[:, 1].mean() if len(x) else np.nan for x in fr])
        f[f"{name}_x"] = np.array([x[:, 0].mean() if len(x) else np.nan for x in fr])
        f[f"{name}_dx"] = np.array(
            [abs(x[0, 0] - x[1, 0]) / x[:, 2].mean() if len(x) == 2 else np.nan for x in fr]
        )
        f[f"{name}_h"] = np.array([x[:, 2].mean() if len(x) else np.nan for x in fr])
        f[f"{name}_v"], f[f"{name}_vmax"] = speeds(fr)
    ht = hit_times(strength, p.hit_threshold)
    ht = ht[(ht >= t[0]) & (ht <= t[-1] + 1 / FPS)]
    idx = np.clip(np.round((ht - t[0]) * FPS).astype(int), 0, n - 1)
    f["hits"] = np.bincount(idx, minlength=n)[:n].astype(float)
    step = int(AUDIO_RATE / FPS)
    si = np.clip((t * AUDIO_RATE).astype(int), 0, max(0, len(strength) - step))
    f["smax"] = np.array([strength[s : s + step].max() for s in si]) if len(strength) else 0 * t
    return f


_PEAKY = ("near_v", "far_v", "near_vmax", "far_vmax", "hits", "smax")


def window_features(f: dict[str, np.ndarray]) -> tuple[np.ndarray, list[str]]:
    out: dict[str, np.ndarray] = {}
    for k, v in f.items():
        fill = np.nanmedian(v) if np.isfinite(v).any() else 0.0
        vv = np.nan_to_num(v, nan=fill)
        out[k] = vv
        for w in (1, 3, 6):
            half = int(w * FPS)
            out[f"{k}_m{w}"] = uniform_filter1d(vv, 2 * half + 1)
            if k in _PEAKY:
                out[f"{k}_x{w}"] = maximum_filter1d(vv, 2 * half + 1)
                out[f"{k}_p{w}"] = uniform_filter1d(vv, half + 1, origin=half // 2)
                out[f"{k}_f{w}"] = uniform_filter1d(vv, half + 1, origin=-(half // 2))
    names = sorted(out)
    return np.stack([out[k] for k in names], 1), names


def features(
    t: np.ndarray,
    boxes: np.ndarray,
    strength: np.ndarray,
    p: V2Params | None = None,
    court: Court | None = None,
) -> tuple[np.ndarray, list[str]]:
    return window_features(frame_features(t, boxes, strength, p or V2Params(), court or Court()))


def labels(t: np.ndarray, gt: RallySet) -> np.ndarray:
    y = np.zeros(len(t), int)
    for r in gt.rallies:
        y[(t >= r.start_ms / 1000) & (t < r.end_ms / 1000)] = 1
    return y


def new_classifier():
    from sklearn.ensemble import HistGradientBoostingClassifier

    return HistGradientBoostingClassifier(
        max_iter=300,
        learning_rate=0.05,
        max_leaf_nodes=15,
        l2_regularization=1.0,
        early_stopping=False,
    )


def segment(
    t: np.ndarray, proba: np.ndarray, hits_s: np.ndarray, p: V2Params, duration_ms: int | None
) -> list[Rally]:
    ps = uniform_filter1d(proba, max(1, int(p.smooth_s * FPS)))
    segs: list[list[float]] = []
    on, s = False, 0
    for i, v in enumerate(ps):
        if not on and v >= p.thr_on:
            on, s = True, i
        elif on and v < p.thr_off:
            on = False
            segs.append([t[s], t[i]])
    if on:
        segs.append([t[s], t[-1]])
    merged: list[list[float]] = []
    for a, b in segs:
        if merged and a - merged[-1][1] < p.merge_gap_s:
            merged[-1][1] = b
        else:
            merged.append([a, b])
    out: list[Rally] = []
    for a, b in merged:
        h = hits_s[(hits_s >= a - 1.5) & (hits_s <= b + 0.5)]
        if len(h) < p.min_hits or b - a < p.min_len_s:
            continue
        start = max(0, round((h[0] - p.pre_s) * 1000))
        end = round((h[-1] + p.post_s) * 1000)
        if duration_ms is not None:
            end = min(end, duration_ms)
        if out and start <= out[-1].end_ms:
            continue
        hits = [round(x * 1000) for x in h]
        conf = float(np.clip(ps[(t >= a) & (t <= b)].mean(), 0, 1))
        out.append(Rally(start, end, hits=hits, confidence=round(conf, 3)))
    return out


def train(
    t: np.ndarray,
    boxes: np.ndarray,
    strength: np.ndarray,
    gt: RallySet,
    mask: np.ndarray | None = None,
    params: V2Params | None = None,
    court: Court | None = None,
) -> V2Model:
    p, c = params or V2Params(), court or Court()
    X, names = features(t, boxes, strength, p, c)
    y = labels(t, gt)
    m = np.ones(len(t), bool) if mask is None else mask
    clf = new_classifier().fit(X[m], y[m])
    return V2Model(clf, names, p, c)


def predict_proba(model: V2Model, t, boxes, strength) -> np.ndarray:
    X, names = features(t, boxes, strength, model.params, model.court)
    if names != model.feature_names:
        raise ValueError("caractéristiques différentes de celles du modèle")
    return model.classifier.predict_proba(X)[:, 1]


def detect(
    model: V2Model,
    t: np.ndarray,
    boxes: np.ndarray,
    strength: np.ndarray,
    video: str,
    camera: str = "autre",
    duration_ms: int | None = None,
) -> RallySet:
    proba = predict_proba(model, t, boxes, strength)
    hits = hit_times(strength, model.params.hit_threshold)
    return RallySet(
        video, camera, duration_ms, segment(t, proba, hits, model.params, duration_ms), "prediction"
    )


def params_dict(model: V2Model) -> dict:
    return {"params": asdict(model.params), "court": asdict(model.court)}
