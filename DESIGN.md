---
name: ID Maîtrise — Dashboard
description: Outil de pilotage de la maîtrise d'œuvre ID Maîtrise, du devis au chantier.
colors:
  accent: "#0071E3"
  accent-text: "#0066CC"
  system-blue: "#007AFF"
  accent-tint: "#EAF3FF"
  label: "#1C1C1E"
  label-strong-secondary: "#3A3A3C"
  label-secondary: "#6E6E73"
  label-tertiary: "#8E8E93"
  separator-opaque: "#D1D1D6"
  separator: "#E5E5EA"
  grouped-background: "#F2F2F7"
  fill-gray: "#EFEFF0"
  row-fill: "#F5F5F7"
  sidebar: "#F9F9FB"
  surface: "#FFFFFF"
  green: "#34C759"
  green-text: "#1E7B34"
  orange: "#FF9500"
  orange-text: "#C93400"
  red: "#FF3B30"
  red-text: "#D70015"
  purple: "#AF52DE"
  purple-text: "#8944AB"
  green-tint: "#EAF8EE"
  green-line: "#BFE9CA"
  orange-tint: "#FFF7E8"
  orange-line: "#FFDDA6"
  orange-deep: "#A0390C"
  red-tint: "#FFF0EF"
  red-line: "#FFC9C6"
  blue-line: "#C6DDF7"
typography:
  large-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Roboto, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Roboto, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.25
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Roboto, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  subhead:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  footnote:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Roboto, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.05em"
  input:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "14px"
  pill: "999px"
spacing:
  xxs: "4px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
components:
  button-filled:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "10px 18px"
    height: "40px"
  button-gray:
    backgroundColor: "{colors.fill-gray}"
    textColor: "{colors.accent-text}"
    rounded: "{rounded.md}"
    padding: "10px 18px"
    height: "40px"
  button-tinted:
    backgroundColor: "{colors.accent-tint}"
    textColor: "{colors.accent-text}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    height: "36px"
  button-row:
    backgroundColor: "{colors.grouped-background}"
    textColor: "{colors.accent-text}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
    height: "32px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.label}"
    typography: "{typography.input}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
    height: "44px"
  search-field:
    backgroundColor: "{colors.fill-gray}"
    textColor: "{colors.label}"
    rounded: "{rounded.md}"
    height: "36px"
  badge:
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  modal:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "{spacing.xl}"
  sidebar:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.label}"
    width: "280px"
  sidebar-item-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
---

# Design System: ID Maîtrise — Dashboard

## Overview

**Creative North Star: "L'app native"**

L'application doit se sentir comme une app iOS / iPadOS bien faite : claire, légère, évidente. Fond gris très clair, contenus sur des cartes blanches à coins arrondis, séparateurs fins, une seule couleur d'accent (le bleu iOS) pour tout ce qui se touche, du texte presque noir pour tout ce qui se lit. Rien de sombre, rien de décoratif : la couleur et le poids servent à dire ce qui compte.

Choix de l'équipe (octobre 2026) : le style précédent était jugé trop sombre ; l'équipe a retenu un style iOS, avec le bleu iOS comme accent, une barre latérale claire façon iPad et la police du système (San Francisco sur iPhone et Mac, Roboto sur Android, Segoe UI sur Windows).

C'est un outil de travail utilisé au bureau et sur chantier, souvent au téléphone : les zones tactiles font au moins 36 à 44 px, les textes ne descendent pas sous 11 px, les champs restent à 16 px.

Les documents produits (PDF, Excel, mails) gardent leur propre charte ID Maîtrise (noir, gris, marine, `lib/`) ; ce document ne concerne que l'interface. Le logo (`public/images/logo-id-maitrise.png`) est en noir et blanc.

**Key Characteristics:**
- Fond gris iOS `#F2F2F7`, cartes blanches à coins de 12 px, séparateurs `#E5E5EA`.
- Un seul accent : le bleu iOS, en remplissage `#0071E3` et en texte `#0066CC` (variantes lisibles du `#007AFF` d'Apple).
- Police du système, grands titres en gras serré (`-0.02em`), titres de section en semi-gras 17 px.
- Barre latérale claire façon iPad : icônes bleues, onglet actif en pastille bleue.
- Barres du haut et du bas translucides (flou) sur téléphone.
- Couleurs système iOS pour les statuts (vert, orange, rouge, violet), toujours en teinte lisible sur fond dilué.

## Colors

Une palette iOS claire : gris système pour la structure, bleu pour l'action, couleurs système pour les statuts.

### Primary
- **Bleu d'action** (`accent`) : boutons pleins, onglet actif, icônes de la barre latérale, bouton +, micro. Texte blanc dessus (contraste 4,7:1).
- **Bleu de lien** (`accent-text`) : liens, texte des boutons gris et teintés, « Voir tous › » (contraste 5,6:1 sur blanc).
- **Bleu système** (`system-blue`) : anneau de focus, barres de progression, statut « En cours ». Jamais pour du texte.
- **Bleu teinté** (`accent-tint`) : fond des boutons teintés et des lignes sélectionnées.

### Neutral
- **Libellé** (`label`) : texte principal, titres, montants.
- **Libellé secondaire fort** (`label-strong-secondary`) : texte courant appuyé.
- **Libellé secondaire** (`label-secondary`) : sous-titres, dates, légendes (≥ 4,5:1 sur blanc et sur gris).
- **Libellé tertiaire** (`label-tertiary`) : icônes inactives, chevrons ›. Jamais pour du texte à lire.
- **Séparateurs** (`separator`, `separator-opaque`) : traits fins, bordures de champs.
- **Fond groupé** (`grouped-background`) : fond des pages, des lignes dans une carte, des boutons de ligne.
- **Gris de remplissage** (`fill-gray`) : boutons gris, champ de recherche.
- **Barre latérale** (`sidebar`) et **surface** (`surface`) : barre latérale claire, cartes, fenêtres.

### Statuts
- **Vert** (`green`, texte `green-text`) : terminé, signé, à jour.
- **Orange** (`orange`, texte `orange-text`) : en attente, échéance proche, à vérifier.
- **Rouge** (`red`, texte `red-text`) : urgent, en retard, dépassement, suppression, erreur.
- **Violet** (`purple`, texte `purple-text`) : planifié ; Qonto (données de la banque).
- **Encadrés d'alerte** : fond `green-tint` / `orange-tint` / `red-tint`, trait `green-line` / `orange-line` / `red-line` (`blue-line` pour l'information), texte de la teinte lisible (`orange-deep` pour un texte long sur fond orange).

### Named Rules
**The One Accent Rule.** Le bleu est la seule couleur d'interaction. Tout ce qui est bleu se touche ; ce qui ne se touche pas n'est pas bleu.

**The Meaning-Only Rule.** Hors du bleu d'action, une couleur porte toujours un statut (vert, orange, rouge, violet). Les sections, catégories, phases et types restent en gris.

**The Neutral Section Rule.** Les sections d'un écran (OS, CR, tâches, PV, entreprises, planning, chiffrage…) n'ont pas de couleur propre (décision d'octobre 2026).

**The Tinted Badge Rule.** Un statut s'affiche en texte de sa teinte lisible (`lib/tone.js`) sur un fond de sa couleur diluée à environ 9 %, en pastille ; jamais en aplat plein. Contraste ≥ 4,5:1.

**Open decision — l'or.** L'or des mails de devis (`#C8A45C`) n'est pas tranché comme couleur de marque ; il n'entre pas dans l'interface.

## Typography

**Display Font:** police du système (`--font-ui` dans `styles/global.css` : -apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, Roboto…)
**Body Font:** police du système
**Label/Mono Font:** police du système, chiffres de même largeur (`font-variant-numeric: tabular-nums` sur `body`)

**Character:** Celle de l'appareil : sur iPhone et Mac, c'est exactement San Francisco ; l'application paraît native et ne télécharge aucune police.

### Hierarchy
- **Large title** (700, 32 px ; 28 px au téléphone, `-0.02em`) : titre de page (« Bonjour … », « Chantiers »).
- **Title** (700, 20 px) : bloc principal d'un écran (« Mes priorités du jour »), marque dans la barre latérale.
- **Headline** (600, 17 px) : titres de section et de carte, titre des fenêtres, titre de la barre mobile.
- **Body** (400-600, 14 px) : boutons, lignes de liste, texte courant.
- **Subhead** (400-600, 13 px) : texte des cartes, descriptions.
- **Footnote** (400, 12 px) : dates, sous-lignes, compteurs.
- **Caption** (600, 11 px, capitales, `0.05em`) : intitulés de chiffres clés et de groupes (« EN RETARD »), badges.
- **Input** (16 px) : tous les champs (pas de zoom automatique d'iOS).

### Named Rules
**The Readable Floor Rule.** Rien sous 11 px ; le texte courant reste à 12 px ou plus.

**The 16px Field Rule.** Un champ de saisie n'est jamais sous 16 px sur téléphone.

## Layout

- **Structure :** barre latérale claire de 280 px, contenu sur fond `grouped-background`, limité à 1 200 px.
- **Sous 768 px :** la barre latérale devient un tiroir ; en-tête de 52 px et barre d'onglets basse translucides (`rgba(249,249,251,0.88)` + flou 20 px), bouton + rond bleu au centre.
- **Rythme :** 8, 12, 16 et 20 px ; 18 px entre les cartes de l'accueil, 24 px entre les sections d'une fiche.
- **Zones tactiles :** champs 44 px, boutons 36 à 40 px, lignes de liste 44 px.

## Elevation & Depth

Presque plat, comme iOS : la profondeur vient du contraste entre le fond gris et les cartes blanches. Les ombres sont réservées à ce qui flotte au-dessus de la page.

### Shadow Vocabulary
- **Repos** (`box-shadow: 0 1px 3px rgba(0,0,0,0.06)`) : cartes posées sur le fond (facultative).
- **Flottant** (`box-shadow: 0 12px 32px rgba(0,0,0,0.12)`) : menus, liste de résultats de recherche, popovers.
- **Bouton flottant** (`box-shadow: 0 8px 24px rgba(0,0,0,0.18)`) : micro de dictée.
- **Fenêtre** : feuille blanche à coins de 14 px sur voile `rgba(0,0,0,0.4)`.

### Named Rules
**The Flat-At-Rest Rule.** Au repos, une carte est blanche sur gris, avec au plus un trait fin. Une ombre marquée signale toujours un élément au-dessus de la page.

## Shapes

- 8 px : boutons de ligne, petits éléments.
- 10 px : boutons, champs, onglets de la barre latérale, champ de recherche.
- 12 px : cartes, lignes de liste détachées, options du menu « Créer ».
- 14 px : fenêtres et feuilles.
- Pastille (999 px) et cercle : badges, compteurs, bouton +, micro, avatars.

## Components

### Buttons
Les quatre styles de bouton d'iOS.
- **Plein** (`btnP`) : fond `accent`, texte blanc, 14 px semi-gras, 40 px — l'action principale d'une zone, une seule fois.
- **Gris** (`btnS`) : fond `fill-gray`, texte `accent-text` — annuler, actions secondaires.
- **Teinté** (`btnAdd`) : fond `accent-tint`, texte `accent-text`, icône + — « Nouvel OS », « Nouveau CR »…
- **De ligne** (`btnChip`) : fond `grouped-background`, texte `accent-text`, icône dessinée, 32 px — PDF, Excel, Envoyer, Modifier.
- **Survol / appui :** classe `.u-btn` (léger assombrissement, enfoncement à l'appui) ; anneau de focus `system-blue` au clavier.
- **Icônes :** toujours dessinées (`I.*` de `shared.js`), jamais d'emoji.

### Chips / Badges
- **Style :** pastille, 11 px semi-gras, texte en teinte lisible sur fond dilué (`components/Badge.js`, `lib/tone.js`).
- **Catégories** (phase, type d'intervenant) : badge gris.

### Cards / Lists
- **Cartes :** blanches, coins de 12 px, trait `separator` facultatif, 16 px de marge intérieure.
- **Lignes dans une carte :** fond `row-fill` / `grouped-background`, coins de 10 px, 44 px minimum, chevron › en `label-tertiary`.
- **Survol :** `.u-press` (fond gris léger), `.u-press--row` pour les lignes denses.

### Inputs / Fields
- **Champ :** fond blanc, trait 1 px `separator-opaque`, coins de 10 px, 44 px, 16 px.
- **Recherche :** champ gris `fill-gray` sans trait, loupe grise, 36 px.
- **Focus :** bordure et halo `system-blue`. **Erreur :** bordure et fond rouges dilués.

### Navigation
- **Barre latérale (ordinateur) :** fond `sidebar`, trait à droite ; marque « ID Maîtrise » en titre 20 px ; recherche ; bouton « Créer… » plein ; onglets 15 px avec icône bleue 18 px ; onglet actif en pastille `accent` texte et icône blancs ; Qonto en violet ; compte et « Déconnexion » (bouton gris, texte rouge) en bas.
- **Téléphone :** en-tête translucide (bouton menu bleu, nom de la page en headline), barre d'onglets translucide (icône active bleue, inactives grises), bouton + rond bleu.
- **Retour :** lien bleu « ‹ Page » en haut à gauche.

### Modal
- Feuille blanche à coins de 14 px sur voile `rgba(0,0,0,0.4)` ; au téléphone, feuille qui monte du bas avec poignée grise.
- Ne se ferme que par ✕ ou les boutons, avec confirmation si des données ont été saisies (`components/Modal.js`).

### Micro de dictée
- Rond bleu `accent` de 56 px, icône micro blanche, sans animation au repos ; rouge `red-text` avec une onde pendant l'écoute ; transcription dans une carte blanche flottante.

## Do's and Don'ts

### Do:
- **Do** utiliser le bleu d'action pour tout ce qui se touche, et seulement pour ça.
- **Do** passer par `btnP`, `btnS`, `btnAdd`, `btnChip`, `inp`, `Badge`, `Section` et les classes `u-*` plutôt que de réécrire des styles.
- **Do** écrire les liens et le texte bleu en `#0066CC`, jamais en `#007AFF` (pas assez lisible).
- **Do** garder les montants et les chiffres clés en `label` (presque noir), en chiffres de même largeur.
- **Do** garder les champs à 16 px et 44 px, les lignes de liste à 44 px.
- **Do** utiliser les durées et courbes de `styles/global.css` (`--motion-fast` 120 ms, `--motion-base` 180 ms, `--ease-standard`).

### Don't:
- **Don't** remettre de fond sombre (barre latérale, en-têtes, cartes) : le style est clair.
- **Don't** donner une couleur propre à une section, une catégorie ou une phase.
- **Don't** utiliser d'emoji comme icône ou dans un titre.
- **Don't** utiliser `label-tertiary` (`#8E8E93`) pour du texte à lire.
- **Don't** introduire l'or `#C8A45C` dans l'interface tant que la décision de marque n'est pas prise.
- **Don't** fermer une fenêtre de saisie au clic sur le fond.
