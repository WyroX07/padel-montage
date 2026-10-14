# Plan de référence

Chaque fil lit ce fichier et `docs/decisions.md` avant de travailler. Le fil coordinateur du projet le tient à jour après chaque décision.

## Organisation

- Les décisions se prennent dans le fil principal du projet ; les fils exécutent.
- Un fil par chantier. Chaque fil a ses propres modules dans le repo, sa branche et sa PR, et ne modifie pas les fichiers d'un autre fil. Un changement nécessaire chez un autre fil lui est demandé via le coordinateur.
- Toute modification de détection est mesurée avec `padel-engine eval` sur `eval/annotations` (rappel, précision, erreurs de début et de fin dans la PR). Réglage sur 0-26:08 du premier match, test sur 26:08-50:12.

## Stack (validée le 2026-10-13)

- Appli de bureau Tauri 2 + React/TypeScript (timeline en Canvas), dans `app/`.
- Moteur Python local `padel_engine` dans `engine/` : PyTorch pour l'entraînement, ONNX Runtime pour l'inférence, FFmpeg.
- Licences permissives uniquement (MIT, BSD, Apache-2.0).

## Chantiers

| # | Chantier | Fil | Fichiers | État |
| --- | --- | --- | --- | --- |
| 1 | Détection par le son | Architecture et plan de détection | `engine/src/padel_engine/detect_audio.py`, `evaluate.py`, `annotations.py`, `tools/annotateur/` | v0 figée comme référence (test : rappel 56 %, précision 34 %) |
| 2 | Détection par l'image | Détection v2 par l'image | modules vision dans `engine/` (`detect_vision*`, fusion) | en cours |
| 3 | Score et overlay | Moteur de score et overlay | moteur de score et rendu de l'overlay | en cours |
| 4 | Appli et timeline | nouveau fil (2026-10-13) | `app/` | démarrage |
| 5 | Nouveaux rushes | Maxence | `eval/annotations/`, `eval/datasets.md` | 2e match sous un autre angle attendu |

Le score/overlay (chantier 3) et l'appli (chantier 4) partagent le code TypeScript commun dans `packages/*`, déclarés en workspaces npm.

## Répartition des modèles

- Opus : plan, architecture, décisions, choix de modèles et de métriques, revues.
- Sonnet : exécution des lots spécifiés dans les fils.
- Haiku : tâches répétitives (conversion de fichiers, proxies, pré-remplissage d'annotations, vérifications, rapports).
