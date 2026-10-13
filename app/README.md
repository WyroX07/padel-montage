# app/

Éditeur de bureau (Tauri 2 + React + TypeScript). On ouvre un rush, les points proposés par le détecteur s'affichent sur la timeline, on ajuste, on exporte.

## Ce que fait l'éditeur

- **Ouvrir un rush.** Si un fichier de points est à côté de la vidéo, il est chargé tout seul : d'abord un montage déjà commencé (`<nom>.padel-edit.json`), sinon les points du détecteur (un JSON `padel-rallies/v1` dont le nom commence comme la vidéo, `source: prediction` de préférence). « Importer des points » charge n'importe quel autre fichier.
- **Timeline** (Canvas) : règle, forme d'onde du son, points en blocs, coups détectés en repères, vue d'ensemble du match en dessous. Glisser un bord ajuste le début ou la fin (la vidéo montre l'image sous le bord), glisser un point le décale, double-clic crée un point. Aimantation sur la tête de lecture, les coups et les bords voisins (Alt pour l'ignorer).
- **Couper, supprimer, ajouter, déplacer** : `C`, `Suppr`, `N`, et la poignée de la liste pour changer l'ordre du montage. Annuler / rétablir sans limite pratique.
- **Lecture** : le rush complet, ou le montage seul (les points enchaînés dans l'ordre de la liste).
- **Enregistrement automatique** du montage à côté du rush.
- **Export** : la vidéo du montage (MP4, depuis l'original), le fichier de montage, ou les points corrigés en vérité terrain (`padel-rallies/v1`, lisible par `padel-engine eval`).
- **Aperçu léger** : si la WebView ne lit pas le codec du rush (HEVC d'iPhone sous Windows), l'appli propose d'en faire une copie 540p en H.264, mise en cache. L'export repart toujours de l'original.

Toutes les commandes sont au clavier ; `?` affiche l'aide-mémoire.

## Formats

| Fichier | Format | Rôle |
| --- | --- | --- |
| Points du détecteur | `padel-rallies/v1` (voir `engine/src/padel_engine/annotations.py`) | Entrée. L'appli ne dépend que de ce fichier, jamais des modules de détection. |
| `<nom>.padel-edit.json` | `padel-edit/v1` (voir `src/model/edit.ts`) | Le montage : liste ordonnée de points `{id, start, end, origin, hits, confidence?}` en ms du rush. |
| `<nom>.verite.json` | `padel-rallies/v1`, `source: ground_truth` | Export des corrections pour mesurer le détecteur. |

Les points ne se chevauchent jamais dans le rush : une seule piste, et un montage qu'on peut toujours réécrire en vérité terrain.

## Développer

```bash
cd app
npm install
npm run dev        # l'éditeur dans le navigateur, http://localhost:1420
npm test           # tests du modèle (Vitest)
npm run tauri dev  # l'appli de bureau (Rust et dépendances système de Tauri requis)
npm run tauri build
```

Dans le navigateur, choisissez en même temps la vidéo, son fichier de points `.json` et son audio `.wav` (forme d'onde). Le navigateur ne lit pas toujours le H.264 (Chromium libre) : utilisez alors une copie WebM. L'appli de bureau n'a pas ces limites.

FFmpeg et ffprobe doivent être dans le PATH (ou désignés par `PADEL_FFMPEG` / `PADEL_FFPROBE`, ou posés à côté de l'exécutable). Ils servent à la forme d'onde, à l'aperçu léger et à l'export.

## Organisation du code

- `src/model/` : logique pure et testée (formats, opérations sur les points, historique, correspondance rush/montage, forme d'onde).
- `src/platform/` : ce que l'éditeur demande à son hôte, avec deux implémentations (`desktop.ts` pour Tauri, `web.ts` pour le navigateur).
- `src/ui/` : lecteur, timeline Canvas, liste des points, dialogues.
- `src-tauri/` : commandes Rust (fichiers à côté du rush, FFmpeg pour sonde, forme d'onde, aperçu et export).

## Licences

React, Vite, Tauri : MIT / Apache-2.0. Polices Inter et JetBrains Mono : SIL OFL, embarquées. FFmpeg est appelé comme programme externe, pas lié ; pour distribuer l'appli avec un FFmpeg fourni, il faudra une version LGPL (sans libx264) et les encodeurs matériels du système, que l'export sait déjà choisir.
