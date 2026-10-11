---
target: fiche chantier
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/user/claud/src/app/pages/ProjectsV.js"
target_path: /home/user/claud/src/app/pages/ProjectsV.js
timestamp: 2026-10-11T13-30-00Z
slug: src-app-pages-projectsv-js
previous_score: 18
---
Method: relecture de conception + détecteur + mesure des cibles tactiles (Chromium, 390 px, zone au doigt forcée) après les PR #98 à #104.

## Design Health Score — page Chantiers et fiche chantier

| # | Heuristique | Avant | Note | Ce qui a changé / reste |
|---|---|---|---|---|
| 1 | Visibilité de l'état | 2 | 3 | États « Enregistrement… », chiffrage chargé à la demande. |
| 2 | Correspondance au réel | 3 | 3 | « Budget engagé » au lieu d'« Avancement ». |
| 3 | Contrôle et liberté | 2 | 2 | Notes protégées ; le retour du téléphone quitte encore la fiche. |
| 4 | Cohérence | 1 | 3 | Sections neutres, boutons gris à icône, une couleur d'action. |
| 5 | Prévention des erreurs | 2 | 3 | Numéro d'OS suivant, notes séparées des fenêtres. |
| 6 | Reconnaissance | 2 | 4 | Bandeau : prochaine réunion, points ouverts, retards, budget engagé. |
| 7 | Efficacité | 2 | 3 | Onglets Suivi / Entreprises / Documents / Finances ; pas d'URL de fiche. |
| 8 | Sobriété | 1 | 3 | 4 onglets au lieu de 11 sections empilées. |
| 9 | Récupération | 1 | 3 | Erreurs rattrapées, messages clairs, file hors ligne pour les tâches. |
| 10 | Aide | 2 | 2 | Peu d'aide contextuelle. |
| **Total** | | **18** | **29/40** | Bon |

## Restes
- [P1] Le bouton retour du téléphone devrait fermer la fiche (useNavReturn / historique) au lieu de quitter la page.
- [P2] Adresse (URL) propre à chaque fiche pour la partager ou y revenir.
- [P2] Tel / e-mail des entreprises cliquables : fait (ChantierIntervenants).
- Cibles tactiles : plus aucune sous 44 px au doigt sur Accueil, Tâches, CR, OS, fiche.
