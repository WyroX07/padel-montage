"""Détection des personnes image par image (YOLOX-s, ONNX Runtime, licence Apache-2.0).

La vidéo est décodée par ffmpeg à ``fps`` images/s et ramenée en 960x540, si bien que les
zones exprimées en pixels ne dépendent pas de la définition du rush. Deux passes par image :
l'image entière (joueurs proches, grands) et un zoom sur la moitié lointaine du terrain
(joueurs lointains, minuscules derrière le filet).

Sortie ``.npz`` : ``t`` (s, une valeur par image) et ``boxes`` (n, 7) =
indice d'image, x1, y1, x2, y2, score, passe (0 image entière, 1 zoom lointain).
"""

from __future__ import annotations

import hashlib
import os
import subprocess
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .ingest import IngestError, _require

W, H = 960, 540
MODEL_URL = "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_s.onnx"
MODEL_SHA256 = "c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063"


@dataclass(frozen=True)
class FarZone:
    """Rectangle (pixels 960x540) zoomé pour les joueurs lointains."""

    x1: int = 320
    y1: int = 130
    x2: int = 740
    y2: int = 240


def model_path() -> Path:
    """Télécharge le modèle au premier appel (cache utilisateur) et vérifie son empreinte."""
    root = Path(os.environ.get("PADEL_ENGINE_MODELS", Path.home() / ".cache" / "padel-engine"))
    path = root / "yolox_s.onnx"
    if path.exists():
        return path
    root.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".part")
    urllib.request.urlretrieve(MODEL_URL, tmp)
    digest = hashlib.sha256(tmp.read_bytes()).hexdigest()
    if digest != MODEL_SHA256:
        tmp.unlink()
        raise OSError(f"empreinte inattendue pour {MODEL_URL} : {digest}")
    tmp.rename(path)
    return path


def _grids(size: int = 640) -> tuple[np.ndarray, np.ndarray]:
    gs, ss = [], []
    for s in (8, 16, 32):
        n = size // s
        yv, xv = np.meshgrid(np.arange(n), np.arange(n), indexing="ij")
        gs.append(np.stack([xv, yv], -1).reshape(-1, 2))
        ss.append(np.full((n * n, 1), s))
    return np.concatenate(gs), np.concatenate(ss)


_GRID, _STRIDE = _grids()


def letterbox(img: np.ndarray, size: int = 640) -> tuple[np.ndarray, float]:
    import cv2

    h, w = img.shape[:2]
    r = min(size / h, size / w)
    rs = cv2.resize(img, (int(w * r), int(h * r)), interpolation=cv2.INTER_LINEAR)
    out = np.full((size, size, 3), 114, np.uint8)
    out[: rs.shape[0], : rs.shape[1]] = rs
    return out, r


def decode(raw: np.ndarray, r: float, conf: float = 0.25, nms: float = 0.45) -> np.ndarray:
    """Sortie brute YOLOX (1, 8400, 85) -> boîtes de personnes (k, 5) x1, y1, x2, y2, score."""
    import cv2

    o = raw[0]
    xy = (o[:, :2] + _GRID) * _STRIDE
    wh = np.exp(o[:, 2:4]) * _STRIDE
    score = o[:, 4] * o[:, 5]  # classe COCO 0 = personne
    k = score > conf
    b = np.concatenate([xy[k] - wh[k] / 2, xy[k] + wh[k] / 2], 1) / r
    score = score[k]
    if not len(b):
        return np.zeros((0, 5), np.float32)
    rects = [[float(x1), float(y1), float(x2 - x1), float(y2 - y1)] for x1, y1, x2, y2 in b]
    idx = np.array(cv2.dnn.NMSBoxes(rects, score.tolist(), conf, nms), dtype=int).reshape(-1)
    return np.concatenate([b[idx], score[idx, None]], 1).astype(np.float32)


class PersonDetector:
    def __init__(self, model: str | Path | None = None, threads: int = 0):
        import onnxruntime as ort

        so = ort.SessionOptions()
        if threads:
            so.intra_op_num_threads = threads
        self.sess = ort.InferenceSession(
            str(model or model_path()), so, providers=ort.get_available_providers()
        )

    def __call__(self, img: np.ndarray) -> np.ndarray:
        lb, r = letterbox(img)
        raw = self.sess.run(None, {"images": lb.transpose(2, 0, 1)[None].astype(np.float32)})[0]
        return decode(raw, r)


def detect_video(
    video: str | Path,
    out: str | Path,
    fps: float = 5.0,
    offset_s: float = 0.0,
    far: FarZone = FarZone(),  # noqa: B008
    model: str | Path | None = None,
    progress=None,
) -> int:
    """Détecte les personnes sur toute la vidéo ; renvoie le nombre d'images traitées."""
    det = PersonDetector(model)
    cmd = [
        _require("ffmpeg"),
        "-loglevel",
        "error",
        "-i",
        str(video),
        "-vf",
        f"fps={fps},scale={W}:{H}",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "bgr24",
        "-",
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    rows: list[np.ndarray] = []
    ts: list[float] = []
    i = 0
    size = W * H * 3
    assert proc.stdout is not None
    while True:
        buf = proc.stdout.read(size)
        if len(buf) < size:
            break
        img = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
        ts.append(offset_s + i / fps)
        full = det(img)
        crop = det(img[far.y1 : far.y2, far.x1 : far.x2])
        crop[:, [0, 2]] += far.x1
        crop[:, [1, 3]] += far.y1
        for src, b in ((0, full), (1, crop)):
            if len(b):
                rows.append(np.column_stack([np.full(len(b), i), b, np.full(len(b), src)]))
        i += 1
        if progress and i % 500 == 0:
            progress(i)
    proc.wait()
    if proc.returncode not in (0, None) and i == 0:
        raise IngestError(f"ffmpeg a échoué : {proc.stderr.read().decode()[-2000:]}")
    boxes = np.concatenate(rows).astype(np.float32) if rows else np.zeros((0, 7), np.float32)
    np.savez_compressed(out, t=np.array(ts), boxes=boxes)
    return i


def load(paths: list[str | Path]) -> tuple[np.ndarray, np.ndarray]:
    """Concatène plusieurs fichiers (morceaux d'un même match, ``t`` déjà décalé)."""
    ts, bx, n = [], [], 0
    for p in paths:
        d = np.load(p)
        b = d["boxes"].copy()
        b[:, 0] += n
        ts.append(d["t"])
        bx.append(b)
        n += len(d["t"])
    return np.concatenate(ts), np.concatenate(bx)
