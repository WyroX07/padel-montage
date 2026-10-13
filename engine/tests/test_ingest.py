import shutil
import subprocess
import wave

import pytest

from padel_engine import ingest

pytestmark = pytest.mark.skipif(
    not (shutil.which("ffmpeg") and shutil.which("ffprobe")), reason="ffmpeg absent"
)


@pytest.fixture
def video(tmp_path):
    out = tmp_path / "t.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc=duration=3:size=1280x720:rate=30",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=3:sample_rate=44100",
            "-c:v",
            "libx264",
            "-c:a",
            "aac",
            "-shortest",
            str(out),
        ],
        check=True,
    )
    return out


def test_probe(video):
    info = ingest.probe(video)
    assert 2900 <= info["duration_ms"] <= 3200
    assert info["fps"] == pytest.approx(30.0)
    assert (info["width"], info["height"]) == (1280, 720)
    assert info["video_codec"] == "h264"
    assert info["has_audio"] is True
    assert info["audio_sample_rate"] == 44100


def test_proxy(video, tmp_path):
    dst = tmp_path / "proxy.mp4"
    ingest.make_proxy(video, dst, height=360)
    info = ingest.probe(dst)
    assert info["height"] == 360 and info["width"] == 640
    assert info["has_audio"] is True


def test_audio(video, tmp_path):
    dst = tmp_path / "a.wav"
    ingest.extract_audio(video, dst)
    with wave.open(str(dst)) as w:
        assert (w.getnchannels(), w.getframerate(), w.getsampwidth()) == (1, 16000, 2)


def test_missing_tool(monkeypatch, video):
    monkeypatch.setattr(ingest.shutil, "which", lambda _: None)
    with pytest.raises(ingest.IngestError, match="ffprobe"):
        ingest.probe(video)
