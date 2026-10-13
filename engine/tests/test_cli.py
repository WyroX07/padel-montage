import json

from padel_engine.annotations import Rally, RallySet
from padel_engine.cli import main


def test_eval_cli(tmp_path, capsys):
    g = RallySet("v.mp4", "terrain", None, [Rally(0, 10000), Rally(20000, 30000)], "ground_truth")
    p = RallySet("v.mp4", "terrain", None, [Rally(0, 10000)], "prediction")
    (tmp_path / "gt").mkdir()
    (tmp_path / "pr").mkdir()
    g.save(tmp_path / "gt" / "v.json")
    p.save(tmp_path / "pr" / "v.json")
    assert main(["eval", "--gt-dir", str(tmp_path / "gt"), "--pred-dir", str(tmp_path / "pr")]) == 0
    out = capsys.readouterr().out
    assert "Manqué" in out and "00:20.0" in out and "Rappel" in out
    assert (
        main(
            [
                "eval",
                "--gt",
                str(tmp_path / "gt/v.json"),
                "--pred",
                str(tmp_path / "pr/v.json"),
                "--json",
            ]
        )
        == 0
    )
    data = json.loads(capsys.readouterr().out)
    assert data["aggregate"]["fn"] == 1


def test_import_cli(tmp_path):
    labels = tmp_path / "l.txt"
    labels.write_text("1.0\t5.0\tr\n")
    out = tmp_path / "o.json"
    assert (
        main(
            [
                "import-audacity",
                str(labels),
                "--video",
                str(tmp_path / "nope.mp4"),
                "--camera",
                "terrain",
                "-o",
                str(out),
            ]
        )
        == 0
    )
    assert json.loads(out.read_text())["rallies"][0]["end_ms"] == 5000
