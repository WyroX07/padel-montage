"""Réglage et mesure du détecteur v2 sur match.MOV.

Réglage uniquement sur 0 -> 26:08 : probabilités hors échantillon par 4 blocs de temps,
grille sur le découpage (objectif 2 x rappel + précision). Le modèle final est appris sur
0 -> 26:08 et appliqué une seule fois à 26:08 -> 50:12.
Écrit eval/predictions/v2/match.json (0 -> 26:08 : hors échantillon ; ensuite : test).

Usage : python run_v2.py DOSSIER   (persons_0*.npz de `padel-engine persons`, match24.wav)
"""

import itertools
import sys
from dataclasses import replace
from pathlib import Path

import numpy as np

from padel_engine import annotations, detect_audio, detect_v2, persons
from padel_engine.annotations import RallySet
from padel_engine.evaluate import evaluate

ROOT = Path(__file__).resolve().parents[2]
SPLIT = 1568.0  # 26:08
d = Path(sys.argv[1])
ablation = "--ablation" in sys.argv

t, boxes = persons.load(sorted(d.glob("persons_0*.npz")))
strength, _ = detect_audio.onset_strength(d / "match24.wav")
gt = annotations.load(ROOT / "eval/annotations/match.json")
RU = gt.reviewed_until_ms / 1000
X, names = detect_v2.features(t, boxes, strength)
y = detect_v2.labels(t, gt)
tune = t < SPLIT
P0 = detect_v2.V2Params()
hits = detect_v2.hit_times(strength, P0.hit_threshold)


def proba(cols):
    Xc = X[:, cols]
    P = np.zeros(len(t))
    edges = np.linspace(0, SPLIT, 5)
    for k in range(4):
        te = (t >= edges[k]) & (t < edges[k + 1])
        tr = tune & ~te
        P[te] = detect_v2.new_classifier().fit(Xc[tr], y[tr]).predict_proba(Xc[te])[:, 1]
    P[~tune] = detect_v2.new_classifier().fit(Xc[tune], y[tune]).predict_proba(Xc[~tune])[:, 1]
    return P


def crop(rs, lo, hi, source):
    return RallySet(
        gt.video, gt.camera, gt.duration_ms, [r for r in rs if lo <= r.start_ms / 1000 < hi], source
    )


def score(rallies, lo, hi):
    return evaluate(crop(gt.rallies, lo, hi, "ground_truth"), crop(rallies, lo, hi, "prediction"))


def run(P, label):
    best, best_key = None, -1
    for on, off, ml, gap, post, nh, sm in itertools.product(
        (0.4, 0.5, 0.6),
        (0.2, 0.3, 0.4),
        (2.0, 3.0),
        (0.0, 1.5, 3.0),
        (1.5, 2.0, 2.5),
        (2, 3),
        (0.6, 1.0, 2.0),
    ):
        if off > on:
            continue
        p = replace(
            P0,
            thr_on=on,
            thr_off=off,
            min_len_s=ml,
            merge_gap_s=gap,
            post_s=post,
            min_hits=nh,
            smooth_s=sm,
        )
        r = score(detect_v2.segment(t, P, hits, p, gt.duration_ms), 0, SPLIT)
        key = 2 * r["recall"] + r["precision"]
        if key > best_key + 1e-9:
            best, best_key, rt = p, key, r
    rr = score(detect_v2.segment(t, P, hits, best, gt.duration_ms), SPLIT, RU)
    print(f"== {label}")
    print(f"  réglage (CV) : rappel {rt['recall']:.3f} précision {rt['precision']:.3f}")
    print(
        f"  test         : rappel {rr['recall']:.3f} précision {rr['precision']:.3f} "
        f"VP {rr['tp']} FP {rr['fp']} FN {rr['fn']}"
    )
    print(f"  paramètres   : {best}")
    return best


audio_cols = [i for i, n in enumerate(names) if n.startswith(("hits", "smax"))]
all_cols = list(range(len(names)))
if ablation:
    run(proba(audio_cols), "son seul")
    run(proba([i for i in all_cols if i not in audio_cols]), "image seule")
P = proba(all_cols)
best = run(P, "son + image")
pred = RallySet(
    gt.video,
    gt.camera,
    gt.duration_ms,
    detect_v2.segment(t, P, hits, best, gt.duration_ms),
    "prediction",
)
out = ROOT / "eval/predictions/v2/match.json"
out.parent.mkdir(parents=True, exist_ok=True)
pred.save(out)
print("écrit", out)
