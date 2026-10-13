# Essais v1 sur match.MOV (2026-10-13)

Vérité terrain : `eval/annotations/match.json` (25 min, 58 points gardés). Validation croisée par 4 blocs de temps.

| Variante | Rappel | Précision | Fin médiane |
| --- | --- | --- | --- |
| v0 son seul (réglé sur ces données) | 67 % | 41 % | 1,41 s |
| v1 classifieur image par image (son + soustraction de fond), CV | 55-60 % | 42-54 % | 1,5 s |
| Hybride : groupes v0 coupés/filtrés par le classifieur, CV | 67-71 % | 43-50 % | 1,6-1,75 s |

Conclusion : pas de gain significatif (1 point = 1,7 % de rappel). Les limites viennent des données :
étiquettes éditoriales (points sans intérêt supprimés), 25 min seulement, un seul angle.
La soustraction de fond (`fg.py`) sépare mal les joueurs proches qui remplissent l'image.

Suite : vérité terrain propre (touche K), autres angles, détecteur de personnes pré-entraîné
(RTMDet/RTMPose, licence Apache) dans un environnement qui autorise le téléchargement des poids.

## Test sur la seconde moitié (26:08 → 50:12, étiquettes propres, jamais vue au réglage)

50 vrais points (8 « sans intérêt »). v0 inchangé :

- Rappel 56 % (28/50), précision 34 %, erreur de fin médiane 1,1 s.
- 48/50 points touchés par au moins une proposition : la détection sonore suffit, le découpage non.
- Points ratés : 9 fusionnés avec un voisin, 6 coupés en plusieurs, 5 bornes décalées, 2 non vus.
- 29 faux positifs hors de tout point, avec 4 à 9 « frappes » chacun : bruits entre les points
  (rebonds avant le service, balles renvoyées au serveur, terrains voisins). Il faut l'image pour les écarter.
