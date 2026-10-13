"""Outils d'ingestion vidéo basés sur ffprobe / ffmpeg."""

from __future__ import annotations

import json
import shutil
import subprocess
from fractions import Fraction
from pathlib import Path


class IngestError(RuntimeError):
    """Erreur liée à ffmpeg/ffprobe."""


def _require(tool: str) -> str:
    path = shutil.which(tool)
    if path is None:
        raise IngestError(
            f"{tool} est introuvable dans le PATH. Installez ffmpeg (https://ffmpeg.org)."
        )
    return path


def _run(cmd: list[str]) -> str:
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, check=True)
    except subprocess.CalledProcessError as e:
        raise IngestError(f"{cmd[0]} a échoué : {e.stderr.strip()[-2000:]}") from e
    return proc.stdout


def _parse_fps(rate: str | None) -> float | None:
    if not rate:
        return None
    try:
        f = Fraction(rate)
    except (ValueError, ZeroDivisionError):
        return None
    return float(f)


def probe(path: str | Path) -> dict:
    ffprobe = _require("ffprobe")
    out = _run(
        [
            ffprobe,
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(path),
        ]
    )
    data = json.loads(out)
    streams = data.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)
    if video is None:
        raise IngestError(f"aucun flux vidéo dans {path}")

    duration = data.get("format", {}).get("duration") or video.get("duration")
    rotation = None
    for sd in video.get("side_data_list", []) or []:
        if "rotation" in sd:
            rotation = int(sd["rotation"])
    if rotation is None and "rotate" in video.get("tags", {}):
        rotation = int(video["tags"]["rotate"])

    return {
        "duration_ms": round(float(duration) * 1000) if duration else None,
        "fps": _parse_fps(video.get("r_frame_rate")),
        "width": video.get("width"),
        "height": video.get("height"),
        "video_codec": video.get("codec_name"),
        "has_audio": audio is not None,
        "audio_sample_rate": int(audio["sample_rate"])
        if audio and audio.get("sample_rate")
        else None,
        "rotation": rotation,
    }


def make_proxy(src: str | Path, dst: str | Path, height: int = 720) -> None:
    ffmpeg = _require("ffmpeg")
    info = probe(src)
    fps = info["fps"] or 30.0
    gop = max(1, round(fps))
    cmd = [
        ffmpeg,
        "-y",
        "-v",
        "error",
        "-i",
        str(src),
        "-vf",
        f"scale=-2:{height}",
        "-c:v",
        "libx264",
        "-crf",
        "23",
        "-preset",
        "veryfast",
        "-g",
        str(gop),
        "-keyint_min",
        str(gop),
        "-pix_fmt",
        "yuv420p",
    ]
    if info["has_audio"]:
        cmd += ["-c:a", "aac", "-b:a", "128k"]
    else:
        cmd += ["-an"]
    cmd += ["-movflags", "+faststart", str(dst)]
    _run(cmd)


def extract_audio(src: str | Path, dst: str | Path, rate: int = 16000) -> None:
    ffmpeg = _require("ffmpeg")
    _run(
        [
            ffmpeg,
            "-y",
            "-v",
            "error",
            "-i",
            str(src),
            "-vn",
            "-ac",
            "1",
            "-ar",
            str(rate),
            "-c:a",
            "pcm_s16le",
            str(dst),
        ]
    )
