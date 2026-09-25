# Migration 027 — Module Devis CRM

## But

Depuis la fiche d'une affaire (dès l'étape « Qualifié »), le bouton
**📄 Créer le devis** ouvre un éditeur de devis :

- lignes (désignation, unité, quantité, PU HT, TVA) et titres de section ;
- remise globale, acompte à la commande, validité, conditions ;
- totaux HT / TVA (par taux) / TTC calculés en direct ;
- PDF aux couleurs ID Maîtrise (`generateDevisPdf` dans `generators.js`).

**Envoyer** ouvre une fenêtre d'envoi (destinataire, objet, message
rédigeable par l'IA) et envoie le mail depuis l'application avec le PDF en
pièce jointe (route `/api/devis/send`, SMTP — voir `SMTP_*` dans
`.env.example`). Sans SMTP configuré, le PDF est téléchargé et la messagerie
s'ouvre avec le mail pré-rempli. Dans les deux cas le devis passe « Envoyé », l'affaire en « Devis envoyé » (montant estimé
= total HT) et programme une relance à J+7. **Accepté** propose de passer
l'affaire en « Gagné » (et donc de créer le chantier).

Intelligence : bouton « ✨ Rédiger avec l'IA » (route `/api/devis-ia`,
lignes chiffrées à partir d'une description, en reprenant les prix
habituels), autocomplétion des désignations déjà chiffrées, et encadré
« Points à vérifier » (lignes sans prix, doublons, écart de prix, TVA
réduite sans attestation…). Logique pure dans `src/app/lib/devisAi.js`.

Numérotation : `AA-NNN` (ex. `26-050`), séquentielle par année (index unique).
En 2026 la séquence démarre à `26-050` pour prolonger les devis déjà émis
(`NUMERO_DEPART` dans `src/app/lib/devis.js`).

## SQL

Voir `027_crm_devis.sql` : table `crm_devis`, FK `opportunite_id`
(ON DELETE CASCADE), RLS staff uniquement (comme 025).

## Sans la migration

La section « Devis » de la fiche affaire affiche un message invitant à
appliquer la migration ; le reste du CRM fonctionne normalement.

## Rollback

```sql
DROP TABLE IF EXISTS public.crm_devis;
```
