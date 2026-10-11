---
target: fiche chantier
total_score: 18
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
target_identity: "file:/home/user/claud/src/app/pages/ProjectsV.js"
target_fingerprint: "sha256:a865dee4f5baaf0649a9bdbd3121a7b92d2ac0ff1fcbc9678e6afcdf3bc09386"
target_path: /home/user/claud/src/app/pages/ProjectsV.js
timestamp: 2026-10-11T09-09-25Z
slug: src-app-pages-projectsv-js
---
Method: dual-agent (A: relecture de conception · B: détecteur) ; navigateur non disponible (application non lançable : identifiants Supabase / Google absents).

## Design Health Score — page Chantiers et fiche chantier (ProjectsV)

| # | Heuristique | Note | Problème principal |
|---|---|---|---|
| 1 | Visibilité de l'état | 2 | Aucun état « enregistrement » (OS, tâche, notes) ; chiffrage rendu null puis apparaît. |
| 2 | Correspondance au réel | 3 | « Avancement » = budget engagé ; dates sans année. |
| 3 | Contrôle et liberté | 2 | Retour du téléphone ne ferme pas la fiche ; useNavReturn non utilisé. |
| 4 | Cohérence | 1 | Deux Section, ~7 styles de boutons, 4 états vides, TTC vs HT, tu/vous. |
| 5 | Prévention des erreurs | 2 | Numéro OS figé OS-2026- (ProjectsV.js:418) ; notes écrasées par les modales. |
| 6 | Reconnaissance | 2 | Points ouverts et prochaine réunion absents de la fiche. |
| 7 | Efficacité | 2 | « (tape /) » mensonger ; pas d'URL de fiche ni de saut de section. |
| 8 | Sobriété | 1 | 11 sections, ~70 boutons, une couleur par section, emoji. |
| 9 | Récupération | 1 | Enregistrements OS/tâche/notes sans try/catch ; « Failed to fetch » brut au PV. |
| 10 | Aide | 2 | Quelques indications, rien de contextuel. |
| **Total** | | **18/40** | Faible |

## Design Specificity Verdict
Contenu très spécifique (DPGF vs OS par lot, ratio SHAB + ½ garage, CR numérotés, entreprises Auto (OS) avec conformité). Forme générique : pile de sections à couleur propre (violet OS, bleu CR, ambre tâches, turquoise PV, vert entreprises, indigo planning, bleu ciel chiffrage), emoji, puces PDF/XLS pastel.
Détecteur : 19 relevés, tous vrais. 4 side-tab (ProjectsV.js:357, ChantierCard.js:35, ChantierIntervenants.js:104/127) ; 15 design-system-color (ambres #92400E/#FEF3C7/#FDE68A, rouge #B91C1C, vert #A7F3D0, indigo #6366F1 planning, bleu ciel #0284C7/#0EA5E9 chiffrage). Relecture et détecteur d'accord sur les bandes latérales et les teintes hors charte.

## Priority Issues
- [P1] Pertes silencieuses et commandes mortes (vérifié) : notes internes effacées par « + Nouvelle tâche / Nouvel OS » (detailForm partagé, ProjectsV.js:419/557/623) ; enregistrements sans gestion d'erreur (:707, :759, :634) ; « Partager » sans fenêtre (:391) ; OS-2026- figé (:418) ; création de tâche non mise en file hors ligne. Commande : harden.
- [P1] Ordre de la fiche pensé bureau : DPGF avant CR / points ouverts / entreprises ; entreprises 4-6 écrans plus bas au téléphone. Fix : bandeau de tête (prochaine réunion, points ouverts / en retard, ligne budget) + Suivi | Entreprises | Documents | Finances, ouverture sur Suivi au téléphone. Commande : layout puis distill.
- [P1] Usage terrain au téléphone : tel / e-mail des entreprises non cliquables (ChantierIntervenants.js:143) ; cibles 20 px et puces 22 px / 10 px ; champs 12-13 px (zoom iOS). Commande : adapt.
- [P1] Bruit visuel = « pas assez pro » : 7 teintes de section, boutons pleins blanc sur #F59E0B / #14B8A6 < 3:1, emoji, puces export. Fix : titres neutres, un bouton marine par zone, icônes I, menu « … ». Commande : quieter puis polish.
- [P2] Poids : tout se monte à l'ouverture (PV, URL signée par pièce, chiffrage requêté deux fois, sync Odoo), éditeurs importés statiquement, pas de squelette interne. Commande : optimize.

## Persona Red Flags
- Maître d'œuvre en réunion de chantier : pas de points ouverts ni de prochaine réunion ; numéros non cliquables loin en bas ; « + Nouveau CR » 11 px ; hors ligne « Failed to fetch » et liens « # » ; retour du téléphone quitte la vue.
- Alex (avancé) : « (tape /) » faux, pas d'URL de fiche, Dupliquer / Modifier / Partager mort au même poids, « Avancement » ambigu.
- Sam (accessibilité) : lots #CBD5E1 11 px ≈ 1,5:1, badges 10 px ambre/vert ≈ 2:1, cibles 20 px, deux h1.

## Minor Observations
Ombre noire et rayon 14 sur l'en-tête ; .u-press écrasé par un fond inline ; 3 phases sur 6 colorées ; ~10 tailles de texte ; 4 styles d'état vide ; « Template », « Upload… », « PJ » ; Title Case anglaise ; résumé CR coupé à 100 caractères ; chCR.sort mute un tableau mémoïsé ; ✕ de suppression visible pour le client ; setState pendant le rendu (:319).

## Questions to Consider
- Si le téléphone ne montrait qu'un écran de la fiche, que contiendrait-il ?
- La fiche est-elle l'archive du chantier ou son tableau des prochaines étapes ?
- Quelle information perdrait-on en retirant toutes les couleurs de section et tous les emoji ?
