import numpy as np
import pytest

pytest.importorskip("cv2")

from padel_engine import persons  # noqa: E402


def test_letterbox_keeps_ratio_and_pads():
    img = np.zeros((540, 960, 3), np.uint8)
    out, r = persons.letterbox(img)
    assert out.shape == (640, 640, 3) and r == pytest.approx(640 / 960)
    assert out[400, 10, 0] == 114  # bas rembourré


def test_decode_single_person_anchor():
    raw = np.full((1, 8400, 85), -10.0, np.float32)
    raw[0, :, 4:] = 0
    raw[0, 0, :4] = [0.5, 0.5, np.log(4), np.log(8)]  # cellule (0, 0), pas de 8
    raw[0, 0, 4] = 0.9
    raw[0, 0, 5] = 0.9
    b = persons.decode(raw, 1.0)
    assert b.shape == (1, 5)
    np.testing.assert_allclose(b[0], [-12, -28, 20, 36, 0.81], rtol=1e-5)


def test_load_concatenates_chunks(tmp_path):
    for k, off in enumerate((0, 10)):
        np.savez(
            tmp_path / f"p{k}.npz",
            t=np.array([off, off + 0.2]),
            boxes=np.array([[1, 0, 0, 1, 1, 0.5, 0]], np.float32),
        )
    t, boxes = persons.load([tmp_path / "p0.npz", tmp_path / "p1.npz"])
    assert list(t) == [0, 0.2, 10, 10.2] and list(boxes[:, 0]) == [1, 3]
