# padel-engine

Moteur Python du montage padel : format d'annotation des rallyes, évaluation de la
détection, outils d'ingestion vidéo (ffmpeg).

## Installation

```bash
pip install -e engine[dev]
```

ffmpeg et ffprobe doivent être dans le `PATH` pour `probe`, `proxy` et `audio`.

## Commandes

```bash
padel-engine probe match.mp4                      # métadonnées (durée, fps, codec, audio...)
padel-engine proxy match.mp4 proxy.mp4            # proxy 720p H.264, image clé chaque seconde
padel-engine audio match.mp4 match.wav            # WAV mono 16 bits, 16 kHz
padel-engine import-audacity labels.txt --video match.mp4 --camera terrain -o gt/match.json
padel-engine eval --gt gt/match.json --pred pred/match.json
padel-engine eval --gt-dir gt/ --pred-dir pred/ --json
```

### Détecteur v2 (image + son)

```bash
pip install -e engine[vision]                     # onnxruntime, opencv, scikit-learn
padel-engine persons match.mp4 -o persons.npz     # YOLOX-s, poids téléchargés au 1er appel
padel-engine train-v2 match24.wav --persons persons.npz --gt gt/match.json -o v2.pkl
padel-engine detect-v2 match24.wav --persons persons.npz --model v2.pkl --video match.mp4 -o pred.json
padel-engine eval --gt gt/match.json --pred pred.json --from-s 1568   # zone de test seule
```

Un rush découpé en morceaux : `persons` sur chacun avec `--offset`, puis tous les `.npz`
dans l'ordre après `--persons`. Le modèle YOLOX-s (Apache-2.0) est mis en cache dans
`~/.cache/padel-engine` (ou `PADEL_ENGINE_MODELS`) et vérifié par empreinte SHA-256.

Caméras : `terrain`, `hauteur_vitre`, `filet`, `trepied_vitre`, `autre`.
`eval` accepte `--iou` (0.5 par défaut) et `--collar` (250 ms par défaut, pour les coups).
Un biais positif signifie que la prédiction arrive en retard sur la vérité terrain.

## Annoter dans Audacity

1. Extraire l'audio : `padel-engine audio match.mp4 match.wav`.
2. Ouvrir `match.wav` dans Audacity.
3. Pour chaque rallye, poser une étiquette de région (Ctrl+B sur une sélection) allant de
   juste avant le service à juste après le dernier coup.
4. Optionnel : étiquettes ponctuelles `h` sur chaque coup, et `s` sur le service.
5. Fichier > Exporter > Exporter les étiquettes (`labels.txt`).
6. Importer : `padel-engine import-audacity labels.txt --video match.mp4 --camera terrain -o gt/match.json`.

Les virgules décimales (Audacity en français) sont acceptées. Les rallyes de la vérité
terrain ne doivent pas se chevaucher.

## Format `padel-rallies/v1`

```json
{"format": "padel-rallies/v1", "video": "match.mp4", "camera": "terrain",
 "duration_ms": 3600000, "source": "ground_truth",
 "rallies": [{"start_ms": 12000, "end_ms": 31500, "hits": [13000, 14200], "serve_ms": 12400}]}
```

## Tests

```bash
cd engine && ruff check && pytest
```
