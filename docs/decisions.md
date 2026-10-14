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
| 2026-10-13 | Stack validée : appli de bureau Tauri 2 + React/TS, moteur Python local | Analyse locale, toutes plateformes, inférence ONNX |
| 2026-10-13 | Un fil par chantier, chacun propriétaire de ses modules, de sa branche et de sa PR ; plan commun dans `docs/plan.md` | Travailler en parallèle sans conflits |
| 2026-10-13 | Opus pour le plan et les décisions, Sonnet pour l'exécution, Haiku pour le répétitif | Demande de Maxence |
| 2026-10-14 | Montage enregistré au format `padel-edit/v1`, à côté du rush (`app/src/model/edit.ts`) | Le projet suit la vidéo, sans base de données |
| 2026-10-14 | « Sans intérêt » (K) = point gardé sur la timeline mais exclu du montage, exporté en `keep: false` | Le score continue de compter ce point |
| 2026-10-14 | Export vidéo par FFmpeg externe : un encodage par point puis concaténation sans réencodage ; un FFmpeg livré avec l'appli doit être une build LGPL (sans libx264), repli sur l'encodeur matériel | Export rapide et licence compatible avec la vente |
