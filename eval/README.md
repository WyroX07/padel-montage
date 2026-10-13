# eval/

Jeu d'évaluation de la détection des points.

- `annotations/` : vérité terrain, un fichier `padel-rallies/v1` par rush (`<nom-du-rush>.json`).
- `predictions/` : sorties du détecteur, mêmes noms de fichiers.
- Les vidéos ne sont **jamais** versionnées ; seul `datasets.md` les décrit.

Lancer l'évaluation :

```bash
padel-engine eval --gt-dir eval/annotations --pred-dir eval/predictions
```
