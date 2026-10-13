# @padel/overlay

Composant React `<Scorebug>` : l'overlay de score affiché sur la vidéo, le même dans l'éditeur et à l'export.

- Deux styles : `nuit` (panneau sombre, colonne des points couleur balle) et `verre` (verre dépoli clair).
- Couleur des points personnalisable (`accent`), taille proportionnelle (`size`, en px ou en `cqw` pour suivre le lecteur).
- Balle de service à côté de l'équipe qui sert, nom du serveur en plein.
- Bandeau : punto de oro, star point, balle de break, de set, de match, tie-break, set, jeu set et match.
- Animations courtes (chiffres qui roulent, bandeau qui se dévoile), réduites si le système le demande.

Polices : Saira Condensed (SIL OFL). L'application devra embarquer les fichiers de police pour un rendu identique hors ligne et à l'export.

## Démo

```bash
npm run demo        # serveur de dev
npm run build:demo  # dist/tableau-de-score.html, un seul fichier
```
