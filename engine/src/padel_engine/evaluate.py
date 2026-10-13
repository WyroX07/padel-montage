"""Évaluation des rallyes prédits face à la vérité terrain."""

from __future__ import annotations

import statistics

import numpy as np
from scipy.optimize import linear_sum_assignment

from .annotations import Rally, RallySet


def fmt_time(ms: int) -> str:
    """Formate en mm:ss.s."""
    total = ms / 1000
    m = int(total // 60)
    s = total - 60 * m
    return f"{m:02d}:{s:04.1f}"


def temporal_iou(a: Rally, b: Rally) -> float:
    inter = max(0, min(a.end_ms, b.end_ms) - max(a.start_ms, b.start_ms))
    union = (a.end_ms - a.start_ms) + (b.end_ms - b.start_ms) - inter
    return inter / union if union > 0 else 0.0


def match_rallies(
    gt: list[Rally], pred: list[Rally], iou: float = 0.5
) -> list[tuple[int, int, float]]:
    """Appariement optimal (indice gt, indice pred, IoU) avec IoU >= seuil."""
    if not gt or not pred:
        return []
    m = np.array([[temporal_iou(g, p) for p in pred] for g in gt])
    rows, cols = linear_sum_assignment(-m)
    return [
        (int(i), int(j), float(m[i, j]))
        for i, j in zip(rows, cols, strict=True)
        if m[i, j] >= iou and m[i, j] > 0
    ]


def match_events(gt: list[int], pred: list[int], collar_ms: int = 250) -> int:
    """Nombre d'événements appariés (glouton, un-à-un, plus proche d'abord)."""
    pairs = sorted(
        (abs(g - p), i, j)
        for i, g in enumerate(gt)
        for j, p in enumerate(pred)
        if abs(g - p) <= collar_ms
    )
    used_g: set[int] = set()
    used_p: set[int] = set()
    for _, i, j in pairs:
        if i not in used_g and j not in used_p:
            used_g.add(i)
            used_p.add(j)
    return len(used_g)


def _prf(tp: int, fp: int, fn: int) -> tuple[float, float, float]:
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return precision, recall, f1


def _p90(values: list[float]) -> float | None:
    return float(np.percentile(values, 90)) if values else None


def _error_stats(start_errs: list[float], end_errs: list[float]) -> dict:
    """Erreurs signées en secondes (positif = prédiction en retard)."""
    return {
        "start_error_median_s": statistics.median(map(abs, start_errs)) if start_errs else None,
        "start_error_p90_s": _p90([abs(x) for x in start_errs]),
        "end_error_median_s": statistics.median(map(abs, end_errs)) if end_errs else None,
        "end_error_p90_s": _p90([abs(x) for x in end_errs]),
        "start_error_mean_signed_s": float(np.mean(start_errs)) if start_errs else None,
        "end_error_mean_signed_s": float(np.mean(end_errs)) if end_errs else None,
    }


def _describe(r: Rally) -> dict:
    return {
        "start_ms": r.start_ms,
        "end_ms": r.end_ms,
        "start": fmt_time(r.start_ms),
        "end": fmt_time(r.end_ms),
    }


def evaluate(gt: RallySet, pred: RallySet, iou: float = 0.5, collar_ms: int = 250) -> dict:
    matches = match_rallies(gt.rallies, pred.rallies, iou)
    matched_g = {i for i, _, _ in matches}
    matched_p = {j for _, j, _ in matches}
    tp = len(matches)
    fp = len(pred.rallies) - tp
    fn = len(gt.rallies) - tp
    precision, recall, f1 = _prf(tp, fp, fn)

    start_errs = [(pred.rallies[j].start_ms - gt.rallies[i].start_ms) / 1000 for i, j, _ in matches]
    end_errs = [(pred.rallies[j].end_ms - gt.rallies[i].end_ms) / 1000 for i, j, _ in matches]

    # Coups : uniquement sur les paires appariées où les deux côtés ont des coups.
    h_tp = h_fp = h_fn = 0
    has_hits = False
    for i, j, _ in matches:
        g_hits, p_hits = gt.rallies[i].hits, pred.rallies[j].hits
        if g_hits and p_hits:
            has_hits = True
            t = match_events(g_hits, p_hits, collar_ms)
            h_tp += t
            h_fp += len(p_hits) - t
            h_fn += len(g_hits) - t
    result: dict = {
        "video": gt.video,
        "camera": gt.camera,
        "iou": iou,
        "collar_ms": collar_ms,
        "n_gt": len(gt.rallies),
        "n_pred": len(pred.rallies),
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "recall": recall,
        "precision": precision,
        "f1": f1,
        "start_errors_s": start_errs,
        "end_errors_s": end_errs,
        **_error_stats(start_errs, end_errs),
        "missed": [_describe(r) for k, r in enumerate(gt.rallies) if k not in matched_g],
        "false_positives": [_describe(r) for k, r in enumerate(pred.rallies) if k not in matched_p],
        "hits": None,
    }
    if has_hits:
        hp, hr, hf = _prf(h_tp, h_fp, h_fn)
        result["hits"] = {
            "tp": h_tp,
            "fp": h_fp,
            "fn": h_fn,
            "precision": hp,
            "recall": hr,
            "f1": hf,
        }
    return result


def aggregate(results: list[dict]) -> dict:
    tp = sum(r["tp"] for r in results)
    fp = sum(r["fp"] for r in results)
    fn = sum(r["fn"] for r in results)
    precision, recall, f1 = _prf(tp, fp, fn)
    start_errs = [e for r in results for e in r["start_errors_s"]]
    end_errs = [e for r in results for e in r["end_errors_s"]]
    out: dict = {
        "n_videos": len(results),
        "n_gt": sum(r["n_gt"] for r in results),
        "n_pred": sum(r["n_pred"] for r in results),
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "recall": recall,
        "precision": precision,
        "f1": f1,
        "start_errors_s": start_errs,
        "end_errors_s": end_errs,
        **_error_stats(start_errs, end_errs),
        "hits": None,
    }
    hit_results = [r["hits"] for r in results if r.get("hits")]
    if hit_results:
        h_tp = sum(h["tp"] for h in hit_results)
        h_fp = sum(h["fp"] for h in hit_results)
        h_fn = sum(h["fn"] for h in hit_results)
        hp, hr, hf = _prf(h_tp, h_fp, h_fn)
        out["hits"] = {
            "tp": h_tp,
            "fp": h_fp,
            "fn": h_fn,
            "precision": hp,
            "recall": hr,
            "f1": hf,
        }
    return out
