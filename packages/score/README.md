# @padel/score

Règles de score du padel, en TypeScript pur, sans dépendance.

- Points 0, 15, 30, 40 ; à 40-40 au choix : **avantages sans limite** (défaut), **punto de oro**, ou **star point** (règle FIP 2026 : deux avantages, puis point décisif à la 3e égalité).
- Sets à 6 jeux (ou 4), deux jeux d'écart, tie-break à 7 à 6-6 (désactivable), 2 sets gagnants ; à une manche partout, **super tie-break à 10** (défaut), tie-break à 7 ou 3e set complet (« 3 sets ») ; ou match en 1 set.
- Service : rotation A1, B1, A2, B2 ; en tie-break, 1 point puis 2 points chacun ; après un tie-break, l'équipe qui a reçu le premier point sert. Correction manuelle possible (événement `server`).
- Balles de break, de set et de match calculées pour l'overlay.
- Départ en cours de match (`config.start`).

## Modèle

On ne stocke que la configuration et la liste des points (`padel-score/v1`). L'état s'obtient en rejouant la liste avec `replay()`. Annuler un point, en corriger un ou en insérer un au milieu revient à modifier la liste : il n'y a jamais d'état incohérent à réparer.

Chaque point peut porter `at` (secondes dans le rush) et `id` (le segment de rally associé). `snapshotAt(snapshots, t)` donne le score à afficher à l'instant `t`.

```ts
import { DEFAULT_CONFIG, replay, snapshotAt, view } from "@padel/score";

const config = { ...DEFAULT_CONFIG, deuceRule: "golden-point" as const };
const snaps = replay(config, [{ kind: "point", winner: "A", at: 12.4 }]);
view(config, snapshotAt(snaps, 20).state).points; // { A: "15", B: "0" }
```

## Pourquoi en TypeScript

Le score est utilisé par l'éditeur (React) à chaque point saisi et par l'overlay, qui est un composant React. Le score ne change qu'entre deux points, donc l'export n'aura qu'une image d'overlay par état (une centaine par match) à rendre depuis ce même composant puis à incruster avec FFmpeg (`overlay=enable='between(t,a,b)'`). Le moteur Python n'a pas besoin de connaître les règles : il lit les intervalles et les images.

## Tests

```bash
npm install
npm test
npm run typecheck
```
