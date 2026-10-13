"""Format d'annotation des rallyes (padel-rallies/v1) et import Audacity."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

FORMAT = "padel-rallies/v1"
CAMERAS = ("terrain", "hauteur_vitre", "filet", "trepied_vitre", "autre")
SOURCES = ("ground_truth", "prediction")
HIT_MARGIN_MS = 500


class AnnotationError(ValueError):
    """Annotation invalide."""


@dataclass
class Rally:
    start_ms: int
    end_ms: int
    hits: list[int] = field(default_factory=list)
    serve_ms: int | None = None
    confidence: float | None = None

    def __post_init__(self) -> None:
        if self.start_ms >= self.end_ms:
            raise AnnotationError(f"start_ms ({self.start_ms}) doit être < end_ms ({self.end_ms})")
        if list(self.hits) != sorted(self.hits):
            raise AnnotationError("hits doit être trié par ordre croissant")
        lo, hi = self.start_ms - HIT_MARGIN_MS, self.end_ms + HIT_MARGIN_MS
        for h in self.hits:
            if not lo <= h <= hi:
                raise AnnotationError(f"hit {h} hors de [{lo}, {hi}]")

    @property
    def duration_ms(self) -> int:
        return self.end_ms - self.start_ms

    def to_dict(self) -> dict:
        d: dict = {"start_ms": self.start_ms, "end_ms": self.end_ms, "hits": list(self.hits)}
        if self.serve_ms is not None:
            d["serve_ms"] = self.serve_ms
        if self.confidence is not None:
            d["confidence"] = self.confidence
        return d

    @classmethod
    def from_dict(cls, d: dict) -> Rally:
        return cls(
            start_ms=int(d["start_ms"]),
            end_ms=int(d["end_ms"]),
            hits=[int(h) for h in d.get("hits", [])],
            serve_ms=None if d.get("serve_ms") is None else int(d["serve_ms"]),
            confidence=None if d.get("confidence") is None else float(d["confidence"]),
        )


@dataclass
class RallySet:
    video: str
    camera: str
    duration_ms: int | None
    rallies: list[Rally]
    source: str
    reviewed_until_ms: int | None = None

    def __post_init__(self) -> None:
        if self.camera not in CAMERAS:
            raise AnnotationError(f"camera invalide {self.camera!r}, attendu parmi {CAMERAS}")
        if self.source not in SOURCES:
            raise AnnotationError(f"source invalide {self.source!r}, attendu parmi {SOURCES}")
        self.rallies = sorted(self.rallies, key=lambda r: (r.start_ms, r.end_ms))
        if self.source == "ground_truth":
            for a, b in zip(self.rallies, self.rallies[1:], strict=False):
                if b.start_ms < a.end_ms:
                    raise AnnotationError(
                        f"rallyes qui se chevauchent en vérité terrain : "
                        f"[{a.start_ms}, {a.end_ms}] et [{b.start_ms}, {b.end_ms}]"
                    )

    def to_dict(self) -> dict:
        return {
            "format": FORMAT,
            "video": self.video,
            "camera": self.camera,
            "duration_ms": self.duration_ms,
            "source": self.source,
            "rallies": [r.to_dict() for r in self.rallies],
            **(
                {"reviewed_until_ms": self.reviewed_until_ms}
                if self.reviewed_until_ms is not None
                else {}
            ),
        }

    @classmethod
    def from_dict(cls, d: dict) -> RallySet:
        if d.get("format") != FORMAT:
            raise AnnotationError(f"format inconnu {d.get('format')!r}, attendu {FORMAT!r}")
        dur = d.get("duration_ms")
        return cls(
            video=d["video"],
            camera=d["camera"],
            duration_ms=None if dur is None else int(dur),
            rallies=[Rally.from_dict(r) for r in d.get("rallies", [])],
            source=d["source"],
            reviewed_until_ms=None
            if d.get("reviewed_until_ms") is None
            else int(d["reviewed_until_ms"]),
        )

    def save(self, path: str | Path) -> None:
        Path(path).write_text(
            json.dumps(self.to_dict(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )

    @classmethod
    def load(cls, path: str | Path) -> RallySet:
        return cls.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))


def load(path: str | Path) -> RallySet:
    return RallySet.load(path)


def save(rally_set: RallySet, path: str | Path) -> None:
    rally_set.save(path)


def _sec_to_ms(text: str) -> int:
    return round(float(text.strip().replace(",", ".")) * 1000)


def from_audacity_labels(
    path: str | Path,
    video: str,
    camera: str,
    duration_ms: int | None = None,
    source: str = "ground_truth",
) -> RallySet:
    """Importe un export de piste d'étiquettes Audacity (``début<TAB>fin<TAB>texte``).

    Régions -> rallyes ; points "h"/"hit" -> coups ; point "s"/"serve" -> service.
    Les lignes de fréquence d'Audacity (commençant par ``\\``) sont ignorées.
    """
    regions: list[tuple[int, int]] = []
    hits: list[int] = []
    serves: list[int] = []
    text = Path(path).read_text(encoding="utf-8-sig")
    for n, line in enumerate(text.splitlines(), 1):
        if not line.strip() or line.startswith("\\"):
            continue
        parts = line.split("\t")
        if len(parts) < 2:
            raise AnnotationError(f"ligne {n} : format invalide {line!r}")
        try:
            start, end = _sec_to_ms(parts[0]), _sec_to_ms(parts[1])
        except ValueError as e:
            raise AnnotationError(f"ligne {n} : temps invalide ({e})") from e
        label = parts[2].strip().lower() if len(parts) > 2 else ""
        if start < end:
            regions.append((start, end))
        elif start == end:
            if label in ("h", "hit"):
                hits.append(start)
            elif label in ("s", "serve"):
                serves.append(start)
        else:
            raise AnnotationError(f"ligne {n} : fin avant début")

    regions.sort()
    rallies: list[Rally] = []
    for s, e in regions:
        r_hits = sorted(h for h in hits if s <= h <= e)
        r_serves = sorted(x for x in serves if s <= x <= e)
        rallies.append(Rally(s, e, hits=r_hits, serve_ms=r_serves[0] if r_serves else None))
    return RallySet(video, camera, duration_ms, rallies, source)
