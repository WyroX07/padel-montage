import numpy as np
from scipy.io import wavfile

from padel_engine.detect_audio import SR, AudioV0Params, detect, group_rallies


def test_group_rallies_splits_on_gap_and_drops_short_groups():
    hits = np.array([1.0, 2.0, 3.0, 4.0, 10.0, 11.0, 20.0, 21.0, 22.0, 23.0, 24.0])
    r = group_rallies(hits, AudioV0Params(max_gap_s=2.5, min_hits=4, pre_s=0.3, post_s=1.0), None)
    assert [(x.start_ms, x.end_ms) for x in r] == [(700, 5000), (19700, 25000)]


def test_detect_finds_synthetic_rally(tmp_path):
    rng = np.random.default_rng(0)
    x = rng.normal(0, 200, SR * 30)
    click = (rng.normal(0, 1, 120) * np.exp(-np.arange(120) / 20) * 20000).astype(np.float32)
    for t in np.arange(10, 18, 1.1):
        i = int(t * SR)
        x[i : i + 120] += click
    path = tmp_path / "a.wav"
    wavfile.write(path, SR, np.clip(x, -32768, 32767).astype(np.int16))
    rs = detect(path, video="a.mp4")
    assert len(rs.rallies) == 1
    r = rs.rallies[0]
    assert abs(r.start_ms - 9700) < 100 and abs(r.end_ms - 19700) < 1200
