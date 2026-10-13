# padel-montage

Logiciel de montage qui prend le rush brut d'un match de padel, détecte automatiquement les points, propose un prédécoupage, puis permet d'ajuster le montage et d'ajouter un overlay de score.

Plan et architecture : doc du projet « Logiciel de montage padel : architecture et plan ».

## Structure

| Dossier | Contenu | Phase |
| --- | --- | --- |
| `engine/` | Moteur Python `padel_engine` : import vidéo, détection, évaluation | 0 à 2 |
| `tools/annotateur/` | Outil HTML pour corriger un prédécoupage et produire la vérité terrain | 0 |
| `eval/` | Vérité terrain (`annotations/`) et prédictions (`predictions/`), jamais de vidéo | 0 |
| `research/` | Essais datés : scripts et notes de mesure, gardés même quand ils échouent | 1 et 2 |
| `docs/` | Décisions d'architecture | |
| `packages/score/` | Règles du score padel (TypeScript pur) : points, jeux, sets, tie-break, service | 4 |
| `packages/overlay/` | Overlay de score React et sa page de démo | 4 |
| `app/` | Application desktop Tauri + React | 3 et 4 |

## Boucle de travail sur un rush

1. **Proxy** : `padel-engine proxy rush.MOV rush_proxy.mp4` et `padel-engine audio rush.MOV rush24.wav --rate 24000`.
2. **Prédécoupage** : `padel-engine detect rush24.wav --video rush.MOV --camera trepied_vitre -o eval/predictions/rush.json`.
3. **Correction** : ouvrir `tools/annotateur/index.html`, charger les vidéos et le JSON.
   Suppr = pas un point, K = vrai point sans intérêt, Entrée = valider. Exporter dans `eval/annotations/rush.json`.
4. **Mesure** : `padel-engine eval --gt-dir eval/annotations --pred-dir eval/predictions` (`--start`/`--end` pour une fenêtre).

Règle : on règle sur une partie des données et on mesure sur une autre, jamais vue au réglage.

## Démarrer

```bash
pip install -e 'engine[dev]'
cd engine && ruff check . && pytest -q
```

Prérequis : Python 3.12, FFmpeg dans le PATH.

Score et overlay : `npm install && npm test` (Node 22).

## Où on en est

Voir `eval/datasets.md` pour les rushes et `research/` pour les derniers chiffres.
