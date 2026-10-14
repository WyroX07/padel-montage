# v2 : position des joueurs (image) + son, sur match.MOV (2026-10-14)

## Méthode

1. `padel-engine persons` : YOLOX-s (Apache-2.0, poids ONNX publiés sur GitHub par Megvii) à
   5 images/s, deux passes par image (image entière + zoom sur la moitié lointaine).
   ~220 ms par image sur 4 CPU, soit ~1 h pour 52 min de match.
   Hugging Face et download.openmmlab.com sont bloqués dans l'environnement cloud, d'où YOLOX
   plutôt que RTMDet/RTMPose.
2. `padel_engine.detect_v2` : par image, joueurs proches et lointains (nombre, position des
   pieds, écart entre partenaires, vitesse), force d'attaque et frappes du son ; agrégats sur
   1, 3 et 6 s ; gradient boosting -> P(en jeu) ; hystérésis, puis bornes calées sur la
   première et la dernière frappe du segment.
3. `run_v2.py` : réglage sur 0 -> 26:08 uniquement (probabilités hors échantillon par 4 blocs,
   grille sur le découpage, objectif 2 x rappel + précision), modèle appris sur 0 -> 26:08,
   appliqué à 26:08 -> 50:12. Prédictions dans `eval/predictions/v2/match.json`.

## Résultats sur le test (26:08 -> 50:12, 50 points, jamais vus au réglage)

`padel-engine eval --gt eval/annotations/match.json --pred eval/predictions/v2/match.json --from-s 1568`

| Variante | Rappel | Précision | Début médian | Fin médiane |
| --- | --- | --- | --- | --- |
| v0 son seul | 56 % (28/50) | 34 % | 0,00 s | 1,12 s |
| v2 classifieur, caractéristiques son seules | 38 % | 28 % | | |
| v2 classifieur, image seule | 76 % | 72 % | | |
| **v2 image + son** | **78 % (39/50)** | **74 %** | 0,57 s | 2,05 s |

- Sensibilité : les 20 meilleurs réglages en validation croisée donnent 74 à 82 % de rappel et
  70 à 80 % de précision sur le test. 1 point = 2 %.
- Le signal vient de l'image : le son seul ne fait pas mieux que v0 dans ce cadre.
  Ce qui sépare le mieux : entre les points, les joueurs proches marchent au milieu du terrain
  (ramasser les balles) ; pendant le point, ils sont collés à la vitre, souvent hors champ.
- Points ratés (11) : 7 bornes décalées (souvent un début tardif sur un long point), 3 fusionnés,
  1 non vu ; 3 des 8 points « sans intérêt » sont ratés.
- Faux positifs (14) : 6 seulement hors de tout point (29 pour v0) ; les autres chevauchent un
  vrai point avec des bornes trop décalées.
- Les bornes restent le point faible : fin médiane 2,05 s, biais +2,2 s (trop tard). Les
  essais de calage des bornes (classifieur « service / dernière frappe » sur chaque frappe,
  prolongation tant que les frappes s'enchaînent) n'ont rien gagné en validation croisée.

## Limites

- Un seul match, un seul cadrage, appris sur 26 min. La géométrie (`detect_v2.Court`) est en
  pixels pour ce trépied derrière la vitre : un autre cadrage demandera un calibrage du
  terrain (4 coins cliqués par l'utilisateur -> homographie).
- Avant 26:08, les points sans intérêt ont été supprimés de la vérité terrain (pas de touche K),
  donc une partie des « faux positifs » de réglage sont de vrais points.

## Suite proposée

1. Calibrage du terrain (homographie) pour rendre les caractéristiques indépendantes du cadrage.
2. Bornes : détecter le service (posture du serveur, rebond avant frappe) avec la pose
   (RTMPose, Apache-2.0) dès que les poids sont téléchargeables.
3. Annoter d'autres matchs et cadrages : c'est la limite principale de l'apprentissage.
