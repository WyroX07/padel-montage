# padel-montage

Logiciel de montage qui prend le rush brut d'un match de padel, détecte automatiquement les points, propose un prédécoupage, puis permet d'ajuster le montage et d'ajouter un overlay de score.

Plan et architecture : voir le doc du projet « Logiciel de montage padel : architecture et plan ».

## Structure

| Dossier | Contenu | Phase |
| --- | --- | --- |
| `engine/` | Moteur d'analyse Python : import vidéo, détection, évaluation | 0 à 2 |
| `eval/` | Annotations de vérité terrain et prédictions (pas de vidéos) | 0 |
| `app/` | Application desktop Tauri + React | 3 et 4 |
| `docs/` | Décisions d'architecture | |

## Démarrer

```bash
pip install -e 'engine[dev]'
padel-engine probe mon_rush.mp4
```

Prérequis : Python 3.12, FFmpeg dans le PATH.
