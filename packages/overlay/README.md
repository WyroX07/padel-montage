# @padel/overlay

Composant React `<Scorebug>` : l'overlay de score affiché sur la vidéo, le même dans l'éditeur et à l'export.

- Deux styles : `nuit` (panneau sombre, colonne des points couleur balle) et `verre` (verre dépoli clair).
- Couleur des points personnalisable (`accent`), taille proportionnelle (`size`, en px ou en `cqw` pour suivre le lecteur).
- Balle de service à côté de l'équipe qui sert, nom du serveur en plein.
- Bandeau : punto de oro, star point, balle de break, de set, de match, tie-break, set, jeu set et match.
- Animations courtes (chiffres qui roulent, bandeau qui se dévoile), réduites si le système le demande.

Police : Saira Condensed (SIL OFL), embarquée via `@fontsource/saira-condensed` : rien à charger en ligne, et les images d'export ont la même police.

## Export

```ts
import { scoreBeforeEachPoint } from "@padel/score";
import { overlayFrames, renderScorebugPng } from "@padel/overlay";

const snaps = scoreBeforeEachPoint(config, winners); // snaps[i] = score avant le point i
for (const frame of overlayFrames(config, snaps)) {
  const png = await renderScorebugPng({ config, state: frame.snapshot.state, outcome: frame.snapshot.outcome, size: 28 });
  // frame.indexes : les points (clips) qui affichent cette image
}
```

`renderScorebugPng` tourne dans la webview (il faut un DOM) et rend un PNG transparent à la taille du bandeau, sans animation. `size` ≈ 2,6 % de la hauteur de la vidéo (28 en 1080p, 56 en 4K).

## Démo

```bash
npm run demo        # serveur de dev
npm run build:demo  # dist/tableau-de-score.html, un seul fichier
```
