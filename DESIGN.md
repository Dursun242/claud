---
name: ID Maîtrise — Dashboard
description: Outil de pilotage de la maîtrise d'œuvre ID Maîtrise, du devis au chantier.
colors:
  navy-maitrise: "#1E3A5F"
  ink-night: "#0F172A"
  signal-blue: "#3B82F6"
  action-blue: "#2563EB"
  link-blue-deep: "#1D4ED8"
  slate-strong: "#334155"
  slate-secondary: "#475569"
  slate-muted: "#64748B"
  slate-faint: "#94A3B8"
  line-strong: "#CBD5E1"
  line: "#E2E8F0"
  canvas: "#F1F5F9"
  surface-soft: "#F8FAFC"
  surface: "#FFFFFF"
  success: "#10B981"
  success-text: "#047857"
  success-tint: "#ECFDF5"
  warning: "#F59E0B"
  warning-text: "#B45309"
  warning-tint: "#FFFBEB"
  danger: "#DC2626"
  danger-bright: "#EF4444"
  danger-line: "#FECACA"
  danger-tint: "#FEF2F2"
  planned-violet: "#8B5CF6"
  qonto-lavender: "#A78BFA"
  info-tint: "#EFF6FF"
typography:
  headline:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.2
  title-lg:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.4
  label:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.05em"
  input:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "16px"
  pill: "999px"
spacing:
  xxs: "4px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
components:
  button-primary:
    backgroundColor: "{colors.navy-maitrise}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "10px 18px"
    height: "40px"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.slate-secondary}"
    rounded: "{rounded.sm}"
    padding: "10px 18px"
    height: "40px"
  button-create:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "10px 14px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-night}"
    typography: "{typography.input}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
    height: "44px"
  input-error:
    backgroundColor: "{colors.danger-tint}"
    textColor: "{colors.ink-night}"
    rounded: "{rounded.sm}"
  badge:
    typography: "{typography.label}"
    rounded: "{rounded.xl}"
    padding: "2px 8px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "{spacing.lg}"
  modal:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
  sidebar:
    backgroundColor: "{colors.ink-night}"
    textColor: "{colors.slate-faint}"
    width: "280px"
  sidebar-item-active:
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
---

# Design System: ID Maîtrise — Dashboard

## Overview

**Creative North Star: "Le bureau d'études"**

L'application doit avoir la rigueur d'un plan d'ingénieur : une grille nette, des traits fins, des chiffres alignés, une hiérarchie qui se lit d'un coup d'œil. Le bleu marine ID Maîtrise signe l'ensemble ; le reste est une gamme de gris ardoise qui laisse la place au contenu (chantiers, montants, échéances). Cette rigueur est adoucie par des coins arrondis, des ombres à peine marquées et de l'air entre les blocs : un outil précis, pas austère.

C'est un outil de travail utilisé toute la journée, au bureau sur ordinateur et sur chantier au téléphone. La couleur sert d'abord le sens (statut, alerte, action principale) ; la marque vit dans les détails : la barre latérale nuit-marine, le bouton principal marine, l'anneau de focus bleu.

Le style actuel est cohérent dans ses couleurs mais n'est pas encore centralisé : les valeurs sont écrites en ligne dans les composants (`dashboards/shared.js` pour `btnP`, `btnS`, `inp`, `status`, `phase` ; `styles/global.css` pour le mouvement, le focus et les classes `u-*`). Ce document fixe les valeurs de référence avant toute extraction en variables.

Les documents produits (PDF, Excel du chiffrage) ont leur propre charte d'impression, noir et gris en Lato (`lib/chiffrageXlsx.js`) ; les mails HTML utilisent le marine avec une touche d'or (`lib/devisMailHtml.js`). Le logo (`public/images/logo-id-maitrise.png`) est en noir et blanc.

**Key Characteristics:**
- Marine ID Maîtrise pour la marque et l'action principale, bleu signal pour le focus et l'information.
- Gamme ardoise froide (de `#0F172A` à `#F8FAFC`) pour le texte, les traits et les fonds.
- Fond d'application gris clair, contenus sur cartes blanches à bordure fine.
- Une seule police, DM Sans, en graisses 400 à 700.
- Coins arrondis doux (6 à 16 px), ombres très légères.
- Mouvement court et discret (120 à 280 ms), coupé si l'utilisateur demande moins d'animations.

## Colors

Une palette ardoise froide, ponctuée du marine ID Maîtrise et de couleurs de statut réservées au sens.

### Primary
- **Marine ID Maîtrise** (`navy-maitrise`) : couleur de la marque. Bouton principal (`btnP`), lien d'évitement, couleur du thème de l'application installée, en-tête des mails. C'est la seule couleur qui « signe » l'outil.
- **Nuit ardoise** (`ink-night`) : texte fort et titres ; départ du dégradé de la barre latérale (nuit vers marine).

### Secondary
- **Bleu signal** (`signal-blue`) : anneau de focus, bordure des champs au focus, liens d'action (« ← Retour »), statut « En cours », barres de progression par défaut.
- **Bleu action** (`action-blue`) : bouton « Créer » de la barre latérale et bouton + de la navigation mobile.
- **Bleu lien profond** (`link-blue-deep`) : texte sur fond bleu teinté (`info-tint`).

### Tertiary
- **Violet planifié** (`planned-violet`) : statut « Planifié ».
- **Lavande Qonto** (`qonto-lavender`) : accent des onglets liés à Qonto, pour distinguer les données venues de l'API bancaire.

### Neutral
- **Ardoise forte** (`slate-strong`) : texte courant appuyé.
- **Ardoise secondaire** (`slate-secondary`) : texte des boutons secondaires, notes.
- **Ardoise atténuée** (`slate-muted`) : texte secondaire, légendes, icônes au repos. C'est la couleur la plus employée de l'application.
- **Ardoise pâle** (`slate-faint`) : texte des onglets inactifs de la barre latérale, indications.
- **Trait appuyé** (`line-strong`) : bordure au survol, barre de défilement.
- **Trait** (`line`) : bordure des cartes, des champs et des séparateurs.
- **Fond d'application** (`canvas`) : fond général et bouton secondaire.
- **Fond doux** (`surface-soft`) : survol des lignes et cartes cliquables.
- **Surface** (`surface`) : cartes, fenêtres, champs.

### Statuts
- **Succès** (`success`, texte `success-text`, fond `success-tint`) : « Terminé », validations.
- **Attention** (`warning`, texte `warning-text`, fond `warning-tint`) : « En attente », échéances proches.
- **Danger** (`danger`, `danger-bright`, trait `danger-line`, fond `danger-tint`) : « Urgent », retards, suppression, champs en erreur.

### Named Rules
**The Meaning-Only Rule.** Une couleur vive porte toujours un sens (statut, alerte, action). Hors de ces cas, l'interface reste en marine et ardoise.

**The Neutral Section Rule.** Les sections d'un écran (OS, CR, tâches, PV, entreprises, planning, chiffrage…) n'ont pas de couleur propre : titres, compteurs et boutons de création restent en marine et ardoise (décision d'octobre 2026, l'équipe ne se repère pas à la couleur des sections).

**The Tinted Badge Rule.** Un statut s'affiche en texte de sa couleur sur un fond de la même couleur très diluée (couleur + `18` en hexadécimal, environ 9 % d'opacité), jamais en aplat plein.

**Open decision — l'or.** L'or des mails de devis (`#C8A45C`) n'est pas encore tranché comme couleur de marque. Ne pas l'introduire dans l'application tant que la décision n'est pas prise.

## Typography

**Display Font:** DM Sans (via `next/font`, variable `--font-dm-sans`, repli sans-serif)
**Body Font:** DM Sans
**Label/Mono Font:** DM Sans (pas de police à chasse fixe)

**Character:** Une sans-serif géométrique et ronde, nette pour les chiffres et les tableaux, assez chaleureuse pour ne pas paraître administrative.

### Hierarchy
- **Headline** (700, 20 px) : chiffres clés et titres d'écran importants.
- **Title large** (700, 17 px) : titre des fenêtres et nom de la marque dans la barre latérale.
- **Title** (700, 15 px) : titre de page dans la barre du haut, titres de sections.
- **Body** (400 à 600, 13 px, interligne 1.5) : texte courant, boutons.
- **Body small** (400 à 600, 12 px) : texte des listes et des cartes. Taille la plus employée.
- **Caption** (600, 11 px) : informations secondaires (dates, compteurs).
- **Label** (700, 10 px, espacement 0.05em, souvent en capitales) : intitulés de champs et de colonnes, badges.
- **Input** (16 px) : tous les champs de saisie, pour éviter le zoom automatique d'iOS.

### Named Rules
**The 16px Field Rule.** Un champ de saisie n'est jamais en dessous de 16 px sur téléphone (règle déjà imposée par `inp` et par `layout.js` sous 640 px).

**The Readable Floor Rule.** Le texte courant reste à 12 px ou plus ; 10 et 11 px sont réservés aux intitulés et légendes courts. Les tailles en dessous de 10 px (8 px, 7,5 px aujourd'hui sur quelques badges) sont à remonter, pas à reproduire.

## Layout

- **Structure :** barre latérale fixe de 280 px à gauche (nuit-marine), barre du haut blanche avec le titre de page, contenu sur fond `canvas` limité à 1 200 px de large.
- **Sous 768 px :** la barre latérale devient un tiroir (voile sombre, ombre portée) et une barre de navigation basse blanche apparaît, avec un bouton + central pour créer.
- **Sous 640 px :** champs forcés à 16 px ; les fenêtres deviennent des panneaux qui montent du bas (coins arrondis en haut seulement, poignée grise).
- **Rythme :** pas de grille de 4 ou 8 stricte ; les espacements observés vont de 4 à 20 px (4, 6, 8, 10, 12, 14, 16, 20). La cible « aérée » privilégie 8, 12, 16 et 20 px.
- **Zones tactiles :** champs de 44 px de haut minimum, boutons de 40 px.

### Named Rules
**The Air Over Density Rule.** Entre deux blocs, préférer un espacement de plus à une bordure de plus.

## Elevation & Depth

Le système est presque plat : la profondeur vient des fonds (gris d'application, cartes blanches, survol gris très clair) et de bordures fines. Les ombres sont discrètes au repos et ne grandissent qu'en réponse à une interaction ou pour les éléments qui flottent au-dessus de la page.

### Shadow Vocabulary
- **Repos** (`box-shadow: 0 1px 3px rgba(15,23,42,0.06)`) : cartes et blocs posés sur le fond.
- **Survol soulevé** (`box-shadow: 0 4px 12px rgba(15,23,42,0.10)`) : cartes cliquables au survol (`.u-press--lift`).
- **Flottant** (`box-shadow: 0 8px 24px rgba(15,23,42,0.12)`) : menus, popovers.
- **Fenêtre** (`box-shadow: 0 25px 50px rgba(15,23,42,0.25)`) : fenêtres modales, sur voile `rgba(15,23,42,0.6)`.

### Named Rules
**The Flat-At-Rest Rule.** Au repos, une carte n'a qu'une bordure fine et l'ombre de repos. Une ombre plus forte signale toujours un état (survol) ou un élément au-dessus de la page.

**The Slate Shadow Rule.** Les ombres sont teintées nuit ardoise (`rgba(15,23,42,…)`), pas noir pur.

## Shapes

Des coins doucement arrondis partout, sans angles vifs ni formes décoratives.
- 6 px : petits boutons, onglets, éléments de menu.
- 8 px : boutons, champs, menus (rayon le plus employé).
- 10 px : cartes et blocs.
- 12 px : grandes cartes, options du menu « Créer ».
- 16 px : fenêtres modales, badges, bouton + mobile.
- Pastille (999 px) et cercle (50 %) : avatars, compteurs, points de statut.

Bordures : 1 px `line` pour les cartes, 1,5 px pour les champs (plus visibles au doigt).

## Components

### Buttons
Doux et nets : un seul bouton marine par zone, le reste en gris.
- **Shape :** coins arrondis de 8 px.
- **Primary :** fond marine ID Maîtrise, texte blanc, 13 px en 600, 40 px de haut (`btnP`).
- **Secondary :** fond `canvas`, texte ardoise secondaire, mêmes dimensions (`btnS`).
- **Créer :** fond bleu action, réservé à la création depuis la barre latérale ; sur mobile, bouton + de 50 px en dégradé marine vers bleu action.
- **Icône :** `.u-icon-btn` (fond transparent, gris au survol ; variante `--danger` rouge pâle pour supprimer).
- **Hover / Focus / Press :** anneau de focus bleu signal de 2 px décalé de 2 px, visible au clavier seulement ; léger enfoncement à l'appui (`scale(.94)` à `.99`).

### Chips / Badges
- **Style :** texte de la couleur du statut sur fond de la même couleur diluée, 10 px en 700, coins de 16 px, `2px 8px` (`components/Badge.js`).
- **Couleurs :** table `status` de `shared.js` (En cours, Planifié, Terminé, En attente, Urgent) et `phase` (Hors d'air, Technique, Finitions).

### Cards / Containers
- **Corner Style :** 10 à 12 px.
- **Background :** blanc sur fond `canvas`.
- **Shadow Strategy :** ombre de repos ; survol soulevé pour les cartes cliquables.
- **Border :** 1 px `line`, `line-strong` au survol.
- **Internal Padding :** 12 à 16 px.
- **Interaction :** classes `.u-press`, `.u-press--lift` (cartes) et `.u-press--row` (lignes denses), qui couvrent survol, focus clavier et appui tactile.

### Inputs / Fields
- **Style :** fond blanc, bordure 1,5 px `line`, coins de 8 px, 44 px de haut, texte 16 px (`inp`, `sel`).
- **Focus :** bordure bleu signal et halo `0 0 0 3px rgba(59,130,246,0.15)`.
- **Error :** bordure `#FCA5A5`, fond `danger-tint` ; au focus, bordure `danger` et halo rouge (`aria-invalid="true"` ou `inpError`).
- **Clavier mobile :** variantes `inpTel`, `inpEmail`, `inpNumeric` avec le bon `inputMode`.

### Navigation
- **Barre latérale :** dégradé nuit ardoise vers marine, 280 px ; onglets 12,5 px, gris pâle au repos, blancs sur fond `rgba(255,255,255,0.10)` quand actifs, avec une barre verticale d'accent de 3 px (bleu clair `#60A5FA`, lavande pour Qonto).
- **Barre du haut :** blanche, bordure basse `line`, titre de page en 15 px 700.
- **Mobile :** barre basse blanche avec libellés de 10,5 px et bouton + central ; menu « Créer » en panneau qui monte du bas.

### Modal
- **Style :** fenêtre blanche, coins de 16 px, 20 px de marge intérieure, ombre « Fenêtre » sur voile nuit à 60 % ; sur téléphone, panneau plein largeur qui monte du bas.
- **Comportement :** ne se ferme que par ✕ ou par les boutons, avec confirmation si des données ont été saisies (`components/Modal.js`).

## Do's and Don'ts

### Do:
- **Do** utiliser le marine ID Maîtrise (`#1E3A5F`) pour l'action principale d'un écran, et une seule fois par zone.
- **Do** passer par `btnP`, `btnS`, `inp`, `Badge` et les classes `u-*` plutôt que de réécrire des styles en ligne.
- **Do** garder les champs à 16 px et 44 px de haut, et les boutons à 40 px minimum.
- **Do** afficher les statuts avec la règle du badge teinté et les couleurs de la table `status`.
- **Do** teinter les ombres en nuit ardoise et les garder légères au repos.
- **Do** utiliser les durées et courbes de `styles/global.css` (`--motion-fast` 120 ms, `--motion-base` 180 ms, `--motion-slow` 280 ms, `--ease-standard`).

### Don't:
- **Don't** introduire l'or `#C8A45C` dans l'application tant que la décision de marque n'est pas prise.
- **Don't** créer de nouveau texte sous 10 px, ni de texte courant sous 12 px.
- **Don't** ajouter une couleur vive qui ne porte pas de sens (statut, alerte, action).
- **Don't** donner une couleur propre à une section d'écran (titres, compteurs, boutons « + Nouveau »).
- **Don't** gérer le survol avec `onMouseEnter` / `onMouseLeave` en ligne : les classes `u-*` couvrent aussi le clavier et le tactile.
- **Don't** fermer une fenêtre de saisie au clic sur le fond.
