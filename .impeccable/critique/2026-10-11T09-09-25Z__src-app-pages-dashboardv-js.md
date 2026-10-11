---
target: tableau de bord
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/user/claud/src/app/pages/DashboardV.js"
target_fingerprint: "sha256:faaaf3b21a3d13887708b46348cf3d0d0681b5ce934caa814b17163cdc339ce9"
target_path: /home/user/claud/src/app/pages/DashboardV.js
timestamp: 2026-10-11T09-09-25Z
slug: src-app-pages-dashboardv-js
---
Method: dual-agent (A: relecture de conception · B: détecteur) ; navigateur non disponible (application non lançable : identifiants Supabase / Google absents).

## Design Health Score — tableau de bord (DashboardV + panneaux + coque AdminDashboard + MobileNav)

| # | Heuristique | Note | Problème principal |
|---|---|---|---|
| 1 | Visibilité de l'état | 2 | CRM, conformité, mot du jour arrivent sans espace réservé ; le bloc du haut se réordonne. |
| 2 | Correspondance au réel | 3 | Couleur du budget selon la seule dépense ; « Bonne nuit » avant 6 h. |
| 3 | Contrôle et liberté | 3 | Retour et raccourcis bons ; chaque ligne fait quitter la page. |
| 4 | Cohérence | 2 | Emoji vs icônes SVG, badges pleins, rayon 14, survol en onMouseEnter. |
| 5 | Prévention des erreurs | 3 | Page de navigation, peu de risque. |
| 6 | Reconnaissance | 3 | Priorités avec raison ; « + N autres points plus bas » flou. |
| 7 | Efficacité | 3 | Raccourcis présents ; aucune action sur place. |
| 8 | Sobriété | 1 | Neuf blocs ; une tâche en retard visible 4-5 fois. |
| 9 | Récupération | 1 | Échec du chargement critique sans cache : squelette sans fin (AdminDashboard.js:86, 301 ; error jamais lu). |
| 10 | Aide | 2 | Classement des priorités non expliqué. |
| **Total** | | **23/40** | Correct |

## Design Specificity Verdict
Contenu propre à ID Maîtrise (priorités avec raison, agenda RDV + relances + signatures, conformité). Habillage générique : salut 28 px, tuiles pastel emoji, KPI multicolores, micro néon ; aucun trait du « bureau d'études » (0 tabular-nums, marine discret).
Détecteur : 12 relevés (11 design-system-color vrais : ClientOverview.js:26/31/34, CrmPanel.js:7/8/25, PrioritiesPanel.js:32, TodayPanel.js:11, AdminDashboard.js:331/408×2 ; 1 faux positif design-system-radius AdminDashboard.js:321 barre de défilement). Manqués par le détecteur : borderRadius 14 et ombres rgba(0,0,0,…) sur toutes les cartes.

## Priority Issues
- [P1] Trois listes « à faire » + KPI qui se répètent ; page finissant sur « Budget global ». Fix : une seule liste de priorités extensible, retirer À faire et KPI tâches, déplacer budget/KPI CRM. Commande : distill puis layout.
- [P1] Lenteur ressentie : double squelette non conforme, DashboardV en lazy, bloc du haut qui bouge 3-4 fois, mot du jour qui pousse le contenu. Fix : import statique, squelette fidèle, hauteurs réservées, ordre figé. Commande : optimize.
- [P1] Échec de chargement = squelette sans fin, sans message ni « Réessayer ». Fix : lire error, état d'erreur + dernière synchro, avis après ~8 s. Commande : harden.
- [P2] Langage visuel contraire à DESIGN.md : emoji, teintes sans sens, badges pleins (blanc sur #F59E0B ≈ 2,1:1), KPI rouge à 0, micro néon, badge API dégradé 8 px. Fix : icônes I.*, Badge teinté, couleur si > 0, micro marine, tabular-nums. Commande : quieter puis polish.
- [P2] Couleurs et chiffres du budget trompeurs (rouge selon dépense seule, total sur chantiers terminés). Fix : comparer à l'avancement ou aux OS engagés, total limité aux chantiers en cours ou retiré. Commande : clarify.

## Persona Red Flags
- Conducteur de travaux, 7 h 30, 4G faible : deux squelettes, squelette sans fin hors réseau, mot du jour qui décale la liste, micro flottant sur les dates en retard, CR absent de la barre du bas, texte 10 px.
- Alex (avancé) : rien d'actionnable sur place, 12 onglets non groupés, trois entrées « Créer », cloche flottante qui chevauche.
- Sam (accessibilité) : texte #475569 10 px sur marine ≈ 2,4:1, badge ambre plein ≈ 2,1:1, survols sans équivalent focus, « À faire » pas un titre.

## Minor Observations
Salut sur la partie locale de l'e-mail ; « Éch. dépassée » ; today en UTC dans la liste des tâches ; liens 11 px ; voile noir du tiroir mobile ; « 🔒 Admin » ; données de démo semées au premier login ; carte À faire rose dès une tâche urgente.

## Questions to Consider
- Au téléphone, l'accueil pourrait-il se réduire aux trois priorités + « Démarrer le CR du chantier du jour » ?
- Qui agit sur « Budget global » un mardi matin ?
- À quoi ressemblerait une seule table du jour à traits fins, chiffres alignés, sans emoji, marine une fois ?
