import pytest

from padel_engine.annotations import Rally, RallySet
from padel_engine.evaluate import aggregate, evaluate, fmt_time


def rs(source, *rallies):
    return RallySet("v.mp4", "terrain", None, list(rallies), source)


def gt(*r):
    return rs("ground_truth", *r)


def pr(*r):
    return rs("prediction", *r)


def test_perfect():
    r = evaluate(gt(Rally(0, 10000), Rally(20000, 30000)), pr(Rally(0, 10000), Rally(20000, 30000)))
    assert (r["tp"], r["fp"], r["fn"]) == (2, 0, 0)
    assert r["f1"] == 1.0 and r["start_error_median_s"] == 0
    assert r["hits"] is None


def test_one_miss():
    r = evaluate(gt(Rally(0, 10000), Rally(20000, 30000)), pr(Rally(0, 10000)))
    assert (r["tp"], r["fp"], r["fn"]) == (1, 0, 1)
    assert r["recall"] == 0.5 and r["precision"] == 1.0
    assert r["missed"][0]["start"] == "00:20.0" and r["missed"][0]["end"] == "00:30.0"


def test_one_fp():
    r = evaluate(gt(Rally(0, 10000)), pr(Rally(0, 10000), Rally(65000, 70000)))
    assert (r["tp"], r["fp"], r["fn"]) == (1, 1, 0)
    assert r["precision"] == 0.5
    assert r["false_positives"][0]["start"] == "01:05.0"


def test_boundary_errors():
    g = gt(Rally(0, 10000), Rally(20000, 30000))
    p = pr(Rally(500, 10000 + 1000), Rally(20000 - 250, 30000 - 500))
    r = evaluate(g, p)
    assert r["tp"] == 2
    assert r["start_errors_s"] == [0.5, -0.25]
    assert r["end_errors_s"] == [1.0, -0.5]
    assert r["start_error_mean_signed_s"] == pytest.approx(0.125)
    assert r["end_error_mean_signed_s"] == pytest.approx(0.25)
    assert r["start_error_median_s"] == pytest.approx(0.375)
    assert r["start_error_p90_s"] == pytest.approx(0.475)


def test_iou_threshold_edge():
    # intersection 5000 / union 10000 = 0.5 exactement
    g = gt(Rally(0, 7500))
    p = pr(Rally(2500, 10000))
    assert evaluate(g, p, iou=0.5)["tp"] == 1
    r = evaluate(g, p, iou=0.51)
    assert (r["tp"], r["fp"], r["fn"]) == (0, 1, 1)


def test_one_to_one_assignment():
    # deux prédictions recouvrent le même rallye : une seule peut être appariée
    g = gt(Rally(0, 10000), Rally(10000, 20000))
    p = pr(Rally(0, 10000), Rally(0, 9000))
    r = evaluate(g, p)
    assert (r["tp"], r["fp"], r["fn"]) == (1, 1, 1)
    assert r["start_errors_s"] == [0.0] and r["end_errors_s"] == [0.0]


def test_hits_collar():
    g = gt(Rally(0, 10000, hits=[1000, 3000, 5000, 7000]))
    p = pr(Rally(0, 10000, hits=[1200, 3300, 5000, 8000, 9000]))
    r = evaluate(g, p, collar_ms=250)
    h = r["hits"]
    assert (h["tp"], h["fp"], h["fn"]) == (2, 3, 2)
    assert h["precision"] == pytest.approx(0.4) and h["recall"] == pytest.approx(0.5)
    assert h["f1"] == pytest.approx(2 * 0.4 * 0.5 / 0.9)


def test_aggregate():
    r1 = evaluate(gt(Rally(0, 10000)), pr(Rally(1000, 10000)))
    r2 = evaluate(
        gt(Rally(0, 10000), Rally(20000, 30000)), pr(Rally(0, 10000), Rally(50000, 60000))
    )
    a = aggregate([r1, r2])
    assert (a["tp"], a["fp"], a["fn"]) == (2, 1, 1)
    assert a["start_errors_s"] == [1.0, 0.0]
    assert a["start_error_mean_signed_s"] == pytest.approx(0.5)


def test_fmt_time():
    assert fmt_time(75300) == "01:15.3"
    assert fmt_time(0) == "00:00.0"


def test_reviewed_until_crops_predictions():
    gt = RallySet("v", "autre", None, [Rally(1000, 5000)], "ground_truth", reviewed_until_ms=10_000)
    pred = RallySet("v", "autre", None, [Rally(1000, 5000), Rally(20_000, 25_000)], "prediction")
    r = evaluate(gt, pred)
    assert r["tp"] == 1 and r["fp"] == 0 and r["fn"] == 0


def test_window_restricts_both_sides():
    g = gt(Rally(1000, 5000), Rally(20_000, 25_000))
    p = rs("prediction", Rally(1000, 5000), Rally(40_000, 45_000))
    r = evaluate(g, p, start_ms=10_000)
    assert (r["tp"], r["fp"], r["fn"]) == (0, 1, 1)
