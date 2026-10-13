import pytest

from padel_engine.annotations import (
    AnnotationError,
    Rally,
    RallySet,
    from_audacity_labels,
    load,
    save,
)


def test_round_trip(tmp_path):
    rs = RallySet(
        "match.mp4",
        "terrain",
        60000,
        [Rally(20000, 30000, [21000, 25000], 20500, 0.9), Rally(1000, 5000)],
        "ground_truth",
    )
    assert [r.start_ms for r in rs.rallies] == [1000, 20000]
    p = tmp_path / "a.json"
    save(rs, p)
    assert '"format": "padel-rallies/v1"' in p.read_text()
    assert load(p) == rs


def test_rally_validation():
    with pytest.raises(AnnotationError):
        Rally(5000, 5000)
    with pytest.raises(AnnotationError):
        Rally(1000, 5000, hits=[3000, 2000])
    with pytest.raises(AnnotationError):
        Rally(1000, 5000, hits=[400])
    with pytest.raises(AnnotationError):
        Rally(1000, 5000, hits=[5600])
    Rally(1000, 5000, hits=[500, 5500])


def test_rallyset_validation():
    with pytest.raises(AnnotationError):
        RallySet("v", "bad", None, [], "ground_truth")
    with pytest.raises(AnnotationError):
        RallySet("v", "terrain", None, [], "other")
    overlap = [Rally(0, 5000), Rally(4000, 8000)]
    with pytest.raises(AnnotationError):
        RallySet("v", "terrain", None, overlap, "ground_truth")
    RallySet("v", "terrain", None, overlap, "prediction")


def test_bad_format(tmp_path):
    p = tmp_path / "x.json"
    p.write_text('{"format": "nope"}')
    with pytest.raises(AnnotationError):
        load(p)


def test_audacity_import(tmp_path):
    p = tmp_path / "labels.txt"
    p.write_text(
        "10,5\t20,25\tr1\n"
        "10.6\t10.6\ts\n"
        "12,0\t12,0\th\n"
        "15.25\t15.25\thit\n"
        "50\t60\trally\n"
        "55\t55\tH\n"
        "30\t30\tautre\n"
        "\\\t440.0\t500.0\n"
    )
    rs = from_audacity_labels(p, "m.mp4", "filet")
    assert rs.source == "ground_truth" and rs.camera == "filet"
    r1, r2 = rs.rallies
    assert (r1.start_ms, r1.end_ms) == (10500, 20250)
    assert r1.hits == [12000, 15250]
    assert r1.serve_ms == 10600
    assert r2.hits == [55000] and r2.serve_ms is None


def test_audacity_overlap_rejected(tmp_path):
    p = tmp_path / "l.txt"
    p.write_text("0\t10\ta\n5\t15\tb\n")
    with pytest.raises(AnnotationError):
        from_audacity_labels(p, "m.mp4", "terrain")
