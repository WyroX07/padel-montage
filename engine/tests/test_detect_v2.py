import numpy as np
import pytest
from scipy.io import wavfile

pytest.importorskip("sklearn")

from padel_engine import cli, detect_v2  # noqa: E402
from padel_engine.annotations import Rally, RallySet  # noqa: E402
from padel_engine.detect_audio import SR  # noqa: E402

FPS = detect_v2.FPS


def test_split_players_keeps_court_and_dedups_far_zone():
    boxes = np.array(
        [
            [0, 400, 100, 480, 330, 0.9, 0],  # joueur proche, dans le terrain
            [0, 120, 200, 150, 260, 0.9, 0],  # derrière la vitre gauche : hors terrain
            [0, 500, 170, 520, 215, 0.6, 1],  # joueur lointain
            [0, 501, 171, 521, 216, 0.5, 1],  # doublon
            [0, 100, 170, 120, 215, 0.9, 1],  # hors de la zone lointaine
        ]
    )
    near, far = detect_v2.split_players(boxes, 1)
    assert len(near[0]) == 1 and near[0][0, 0] == 440
    assert len(far[0]) == 1 and far[0][0, 3] == pytest.approx(0.6)


def test_speeds_in_body_heights_per_second():
    a = np.array([[100.0, 300.0, 100.0, 0.9]])
    b = np.array([[120.0, 300.0, 100.0, 0.9]])
    mean, mx = detect_v2.speeds([a, b, np.zeros((0, 4))])
    assert mean[1] == pytest.approx(20 / 100 * FPS) and mx[2] == 0


def test_segment_snaps_to_hits_and_drops_short_segments():
    t = np.arange(0, 60, 1 / FPS)
    proba = np.zeros(len(t))
    proba[(t >= 10) & (t < 20)] = 1  # point
    proba[(t >= 40) & (t < 40.6)] = 1  # trop court
    hits = np.array([10.5, 12.0, 14.0, 18.5, 40.2, 40.4, 40.5])
    p = detect_v2.V2Params(smooth_s=0.2)
    r = detect_v2.segment(t, proba, hits, p, None)
    assert [(x.start_ms, x.end_ms) for x in r] == [(10200, 20500)]


def _synthetic(tmp_path):
    """3 points de 10 s : joueurs rapides et frappes ; entre les points, joueurs immobiles."""
    rng = np.random.default_rng(0)
    dur = 120
    t = np.arange(0, dur, 1 / FPS)
    points = [(10, 20), (45, 55), (80, 90)]
    rows = []
    for i, tt in enumerate(t):
        playing = any(a <= tt < b for a, b in points)
        dx = 60 * np.sin(tt * 3) if playing else 0
        rows.append([i, 400 + dx, 100, 480 + dx, 330, 0.9, 0])
        rows.append([i, 500 - dx / 4, 170, 520 - dx / 4, 215, 0.6, 1])
    x = rng.normal(0, 200, SR * dur)
    click = (rng.normal(0, 1, 120) * np.exp(-np.arange(120) / 20) * 20000).astype(np.float32)
    for a, b in points:
        for h in np.arange(a + 0.5, b - 1, 1.1):
            x[int(h * SR) : int(h * SR) + 120] += click
    wav = tmp_path / "a.wav"
    wavfile.write(wav, SR, np.clip(x, -32768, 32767).astype(np.int16))
    npz = tmp_path / "p.npz"
    np.savez(npz, t=t, boxes=np.array(rows, np.float32))
    gt = RallySet(
        "a.mp4", "autre", dur * 1000, [Rally(a * 1000, b * 1000) for a, b in points], "ground_truth"
    )
    gt_path = tmp_path / "gt.json"
    gt.save(gt_path)
    return wav, npz, gt_path


def test_train_and_detect_cli_round_trip(tmp_path):
    wav, npz, gt = _synthetic(tmp_path)
    model = tmp_path / "v2.pkl"
    out = tmp_path / "pred.json"
    assert (
        cli.main(["train-v2", str(wav), "--persons", str(npz), "--gt", str(gt), "-o", str(model)])
        == 0
    )
    assert (
        cli.main(
            [
                "detect-v2",
                str(wav),
                "--persons",
                str(npz),
                "--model",
                str(model),
                "--video",
                "a.mp4",
                "-o",
                str(out),
            ]
        )
        == 0
    )
    assert cli.main(["eval", "--gt", str(gt), "--pred", str(out)]) == 0
    pred = RallySet.load(out)
    assert len(pred.rallies) == 3
    assert cli.main(["eval", "--gt", str(gt), "--pred", str(out), "--from-s", "30", "--json"]) == 0
