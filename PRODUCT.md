# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Application Next.js installable (PWA, `public/manifest.json`, mode `standalone`), utilisée au navigateur sur ordinateur et sur téléphone. Fonctionne hors ligne pour la consultation et une partie de la saisie (`public/sw.js`, IndexedDB).

## Users

- **Équipe ID Maîtrise (admin / salariés, maîtrise d'œuvre)** : utilisateurs principaux, au quotidien. Usage mixte :
  - au bureau, sur ordinateur : CRM et pipeline commercial, devis, chiffrage estimatif (DPGF), ordres de service, Qonto, contacts, conformité des entreprises ;
  - sur chantier, au téléphone : comptes rendus de réunion (dictée, photos, points par lot), tâches, consultation des chantiers, souvent avec un réseau faible ou absent.
- **Personnes extérieures** (clients MOA, entreprises) : place secondaire. Elles voient l'application peu, surtout par les liens envoyés par mail (signature d'un devis, réponse à une relance, dépôt de documents) et l'espace client MOA restreint à leurs chantiers. Elles reçoivent aussi les documents produits (PDF des CR, OS, devis, dossiers de vigilance).

## Product Purpose

Piloter le quotidien de la maîtrise d'œuvre d'ID Maîtrise de bout en bout dans un seul outil : de l'affaire commerciale (CRM, devis, relances, signature) au chantier (OS, CR, PV, planning, tâches, conformité des entreprises), avec l'IA pour gagner du temps sur la saisie (dictée, lecture de photos et de plans, chiffrage). Réussir, c'est que l'équipe passe moins de temps sur l'administratif et plus sur le chantier, sans rien laisser filer (relances, documents expirés, points ouverts).

## Positioning

Outil interne sur mesure, écrit pour la façon de travailler d'ID Maîtrise (SARL, Le Havre) : ses lots, son barème de prix, ses comptes rendus numérotés avec points repris d'une réunion à l'autre, ses mails et ses documents. Ce n'est pas un logiciel BTP générique.

## Operating Context

- Réunions de chantier : saisie du CR au téléphone, en mode Réunion pas à pas, dictée puis proposition IA, photos, envoi par mail aux entreprises.
- Bureau : suivi commercial, préparation et envoi des devis (Qonto), chiffrage à partir des plans du permis, relances, conformité des entreprises.
- Mail du matin (priorités du jour) et tableau de bord comme point d'entrée de la journée.
- Documents produits et envoyés à l'extérieur : PDF de CR, d'OS et de devis, exports Excel, dossier de vigilance.
- Réseau parfois absent sur chantier : l'application doit s'ouvrir et garder la saisie en cours.

## Capabilities and Constraints

- Rôles : admin / salarié (accès complet) et client MOA (ses chantiers uniquement), plus pages publiques par jeton sans compte.
- Interface entièrement en français ; pas d'internationalisation prévue.
- Styles écrits en ligne dans les composants (pas de Tailwind ni de CSS Modules) ; pas encore de CSP à cause de ces styles.
- Fenêtres de saisie : `components/Modal` (pas de fermeture au clic sur le fond, confirmation si des données ont été saisies) et `useLeaveGuard` pour les écrans plein page.
- Erreurs et confirmations par toasts, jamais `alert()`.
- Raccourcis clavier, lien d'évitement, `prefers-reduced-motion` et zoom autorisé déjà en place (README).
- Douleurs signalées par l'utilisateur (octobre 2026) : l'interface paraît **lente ou lourde** et **pas assez professionnelle**.

## Brand Commitments

- Nom : **ID Maîtrise** (SARL ID MAITRISE, 9 rue Henry Genestal, 76600 Le Havre), maîtrise d'œuvre BTP.
- Une charte ID Maîtrise existe déjà dans les exports (Excel du chiffrage, PDF) ; son contenu exact reste à documenter, pas à réinventer.

## Evidence on Hand

- Icônes de l'application : `public/icon-192.*`, `public/icon-512.*`, `public/favicon.ico` ; images dans `public/images/`.
- Aucun témoignage, chiffre client ou référence publique n'est fourni : ne pas en inventer.

## Product Principles

1. **Le terrain d'abord** : ce qui se fait sur chantier doit marcher au téléphone, d'une main, avec un réseau faible, sans perdre de saisie.
2. **La vitesse est une fonction** : un écran qui tarde coûte plus qu'un écran sobre ; chaque ajout se justifie face à son poids.
3. **Professionnel sans effet** : l'outil doit inspirer confiance par sa netteté et sa cohérence, pas par la décoration.
4. **Rien ne se perd** : relances, échéances, documents expirés et points ouverts restent visibles jusqu'à ce qu'ils soient traités.
5. **L'IA propose, l'équipe décide** : les résultats de l'IA sont présentés pour relecture, jamais appliqués en silence.
