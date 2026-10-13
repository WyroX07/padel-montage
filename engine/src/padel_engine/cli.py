"""Interface en ligne de commande de padel-engine."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import annotations, detect_audio, evaluate, ingest


def _pair_inputs(args: argparse.Namespace) -> list[tuple[Path, Path]]:
    if args.gt_dir or args.pred_dir:
        if not (args.gt_dir and args.pred_dir):
            raise SystemExit("--gt-dir et --pred-dir doivent être utilisés ensemble")
        gts = {p.stem: p for p in sorted(Path(args.gt_dir).glob("*.json"))}
        preds = {p.stem: p for p in sorted(Path(args.pred_dir).glob("*.json"))}
        common = sorted(gts.keys() & preds.keys())
        for name in sorted(gts.keys() - preds.keys()):
            print(f"Attention : pas de prédiction pour {name}", file=sys.stderr)
        for name in sorted(preds.keys() - gts.keys()):
            print(f"Attention : pas de vérité terrain pour {name}", file=sys.stderr)
        return [(gts[n], preds[n]) for n in common]
    if not args.gt or not args.pred:
        raise SystemExit("Indiquez --gt et --pred, ou --gt-dir et --pred-dir")
    if len(args.gt) != len(args.pred):
        raise SystemExit("--gt et --pred doivent avoir le même nombre de fichiers")
    return [(Path(g), Path(p)) for g, p in zip(args.gt, args.pred, strict=True)]


def _f(x: float | None, nd: int = 2) -> str:
    return "—" if x is None else f"{x:.{nd}f}"


def _pct(x: float) -> str:
    return f"{100 * x:.1f} %"


def _print_result(r: dict) -> None:
    print(f"== {r['video']} (caméra : {r['camera']}) ==")
    print(f"  Rallyes : {r['n_gt']} réels, {r['n_pred']} prédits (IoU >= {r['iou']})")
    _print_body(r)
    for m in r.get("missed", []):
        print(f"  Manqué          : {m['start']} -> {m['end']}")
    for p in r.get("false_positives", []):
        print(f"  Faux positif    : {p['start']} -> {p['end']}")
    print()


def _print_body(r: dict) -> None:
    print(f"  VP {r['tp']}  FP {r['fp']}  FN {r['fn']}")
    print(f"  Rappel {_pct(r['recall'])}  Précision {_pct(r['precision'])}  F1 {_pct(r['f1'])}")
    print(
        f"  Erreur début (s) : médiane {_f(r['start_error_median_s'])}, "
        f"p90 {_f(r['start_error_p90_s'])}, biais {_f(r['start_error_mean_signed_s'])}"
    )
    print(
        f"  Erreur fin   (s) : médiane {_f(r['end_error_median_s'])}, "
        f"p90 {_f(r['end_error_p90_s'])}, biais {_f(r['end_error_mean_signed_s'])}"
    )
    print("  (biais > 0 : prédiction en retard)")
    h = r.get("hits")
    if h:
        print(
            f"  Coups : VP {h['tp']}  FP {h['fp']}  FN {h['fn']}  "
            f"P {_pct(h['precision'])}  R {_pct(h['recall'])}  F1 {_pct(h['f1'])}"
        )


def _cmd_probe(args: argparse.Namespace) -> int:
    print(json.dumps(ingest.probe(args.video), indent=2, ensure_ascii=False))
    return 0


def _cmd_proxy(args: argparse.Namespace) -> int:
    ingest.make_proxy(args.video, args.out, height=args.height)
    print(f"Proxy écrit : {args.out}")
    return 0


def _cmd_audio(args: argparse.Namespace) -> int:
    ingest.extract_audio(args.video, args.out, rate=args.rate)
    print(f"Audio écrit : {args.out}")
    return 0


def _cmd_import(args: argparse.Namespace) -> int:
    duration = None
    try:
        duration = ingest.probe(args.video)["duration_ms"]
    except (ingest.IngestError, OSError):
        pass
    rs = annotations.from_audacity_labels(
        args.labels, Path(args.video).name, args.camera, duration_ms=duration
    )
    rs.save(args.output)
    print(f"{len(rs.rallies)} rallyes écrits dans {args.output}")
    return 0


def _cmd_eval(args: argparse.Namespace) -> int:
    results = []
    for g, p in _pair_inputs(args):
        results.append(
            evaluate.evaluate(
                annotations.load(g),
                annotations.load(p),
                iou=args.iou,
                collar_ms=args.collar,
                start_ms=None if args.start is None else round(args.start * 1000),
                end_ms=None if args.end is None else round(args.end * 1000),
            )
        )
    if not results:
        raise SystemExit("Aucune paire à évaluer")
    agg = evaluate.aggregate(results)
    if args.json:
        print(json.dumps({"videos": results, "aggregate": agg}, indent=2, ensure_ascii=False))
        return 0
    for r in results:
        _print_result(r)
    if len(results) > 1:
        print(f"== TOTAL ({agg['n_videos']} vidéos) ==")
        print(f"  Rallyes : {agg['n_gt']} réels, {agg['n_pred']} prédits")
        _print_body(agg)
    return 0


def _cmd_detect(args: argparse.Namespace) -> int:
    params = detect_audio.AudioV0Params(
        threshold=args.threshold, max_gap_s=args.max_gap, min_hits=args.min_hits
    )
    rs = detect_audio.detect(
        args.wav, video=args.video, camera=args.camera, duration_ms=args.duration_ms, params=params
    )
    rs.save(args.output)
    print(f"{len(rs.rallies)} points détectés, écrits dans {args.output}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="padel-engine", description="Moteur de détection de rallyes")
    sub = p.add_subparsers(dest="command", required=True)

    s = sub.add_parser("probe", help="affiche les métadonnées d'une vidéo")
    s.add_argument("video")
    s.set_defaults(func=_cmd_probe)

    s = sub.add_parser("proxy", help="crée un proxy H.264 léger")
    s.add_argument("video")
    s.add_argument("out")
    s.add_argument("--height", type=int, default=720)
    s.set_defaults(func=_cmd_proxy)

    s = sub.add_parser("audio", help="extrait l'audio en WAV mono 16 bits")
    s.add_argument("video")
    s.add_argument("out")
    s.add_argument("--rate", type=int, default=16000)
    s.set_defaults(func=_cmd_audio)

    s = sub.add_parser("import-audacity", help="convertit des étiquettes Audacity en JSON")
    s.add_argument("labels")
    s.add_argument("--video", required=True)
    s.add_argument("--camera", required=True, choices=annotations.CAMERAS)
    s.add_argument("-o", "--output", required=True)
    s.set_defaults(func=_cmd_import)

    s = sub.add_parser("eval", help="évalue des prédictions face à la vérité terrain")
    s.add_argument("--gt", nargs="+")
    s.add_argument("--pred", nargs="+")
    s.add_argument("--gt-dir")
    s.add_argument("--pred-dir")
    s.add_argument("--iou", type=float, default=0.5)
    s.add_argument("--collar", type=int, default=250, help="tolérance des coups en ms")
    s.add_argument("--start", type=float, help="début de la fenêtre évaluée (s)")
    s.add_argument("--end", type=float, help="fin de la fenêtre évaluée (s)")
    s.add_argument("--json", action="store_true", help="sortie JSON")
    s.set_defaults(func=_cmd_eval)

    s = sub.add_parser("detect", help="détecteur v0 (audio seul) : WAV 24 kHz -> points")
    s.add_argument("wav")
    s.add_argument("--video", required=True)
    s.add_argument("--camera", default="autre", choices=annotations.CAMERAS)
    s.add_argument("--duration-ms", type=int)
    s.add_argument("--threshold", type=float, default=12.0)
    s.add_argument("--max-gap", type=float, default=2.5, help="écart max entre frappes (s)")
    s.add_argument("--min-hits", type=int, default=4)
    s.add_argument("-o", "--output", required=True)
    s.set_defaults(func=_cmd_detect)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except BrokenPipeError:  # sortie coupée par `head`, etc.
        return 0
    except (ingest.IngestError, annotations.AnnotationError, OSError) as e:
        print(f"Erreur : {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
