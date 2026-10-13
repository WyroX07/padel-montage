# Décisions

| Date | Décision | Raison |
| --- | --- | --- |
| 2026-10-13 | App desktop, analyse locale | Rushes de 20 à 40 Go par heure en 4K, pas d'upload |
| 2026-10-13 | Audio des frappes comme déclencheur principal, confirmé par la vision | Approche la plus fiable publiée pour le padel (F1 92 %, Decorte et al. 2024) |
| 2026-10-13 | Licences permissives uniquement (pas d'AGPL) | Vente possible à terme |
| 2026-10-13 | Annotation de vérité terrain via les labels Audacity | Annoter à l'oreille est rapide et ne demande aucun outil à développer |
| 2026-10-13 | Vérité terrain : Suppr = pas un point, K = vrai point sans intérêt (`keep: false`) | Mesurer la détection et le tri « intéressant » séparément |
| 2026-10-13 | Réglage sur 0-26:08 du premier match, test sur 26:08-50:12 | Éviter de se tromper avec des réglages faits sur les mêmes données |
| 2026-10-13 | v0 (son seul) gardé comme référence ; v2 = image avec détecteur de joueurs pré-entraîné | Le son entend 96 % des points mais ne sait pas les séparer (voir `research/`) |
| 2026-10-13 | Règles du score en TypeScript (`packages/score`), état rejoué depuis la liste des points | L'éditeur et l'overlay sont en React ; le score ne change qu'entre deux points, donc l'export incruste une image par état sans que Python connaisse les règles |
| 2026-10-13 | À 40-40 : avantages sans limite par défaut, punto de oro et star point au choix | Habitude du groupe de Maxence, choix laissé à l'utilisateur |
| 2026-10-13 | Formats : 2 sets avec super tie-break à 10 (défaut) ou tie-break à 7 à 1-1, 3 sets, 1 set | Ce que joue le groupe de Maxence, et les variantes de tournoi |
