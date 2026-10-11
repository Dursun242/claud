---
target: tableau de bord
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:/home/user/claud/src/app/pages/DashboardV.js"
target_path: /home/user/claud/src/app/pages/DashboardV.js
timestamp: 2026-10-11T13-30-00Z
slug: src-app-pages-dashboardv-js
previous_score: 23
---
Method: relecture de conception + détecteur, après les PR #98 à #104 (fiabilité, style iOS, repères emoji, vitesse, organisation, terrain, finition). Navigateur réel non disponible (identifiants absents) : rendus jsdom → Chromium.

## Design Health Score — tableau de bord

| # | Heuristique | Avant | Note | Ce qui a changé / reste |
|---|---|---|---|---|
| 1 | Visibilité de l'état | 2 | 3 | Squelette fidèle, place réservée au mot du jour, plus de réordonnancement. |
| 2 | Correspondance au réel | 3 | 3 | Budget global sorti de l'accueil équipe. |
| 3 | Contrôle et liberté | 3 | 3 | Inchangé. |
| 4 | Cohérence | 2 | 3 | Une palette iOS, badges teintés, emoji seulement en repère de titre. |
| 5 | Prévention des erreurs | 3 | 3 | Inchangé. |
| 6 | Reconnaissance | 3 | 3 | Priorités avec raison. |
| 7 | Efficacité | 3 | 3 | Actions rapides ; rien d'actionnable sur place. |
| 8 | Sobriété | 1 | 3 | « Mes priorités » + « Ma journée » seulement ; « À faire » et KPI tâches retirés. |
| 9 | Récupération | 1 | 3 | État d'erreur avec « Réessayer », données hors ligne. |
| 10 | Aide | 2 | 2 | Classement des priorités toujours peu expliqué. |
| **Total** | | **23** | **29/40** | Bon |

## Restes
- [P2] Expliquer le classement des priorités (aide contextuelle).
- [P2] Une action sur place depuis « Ma journée » (cocher une tâche) éviterait un aller-retour.
- Détecteur : plus aucune bande latérale ni easing à rebond dans l'app ; 41 relevés restants, surtout des couleurs de catégories (types de contacts, notifications) voulues.
