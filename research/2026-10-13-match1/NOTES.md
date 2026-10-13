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
