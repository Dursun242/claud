# Migration 027 — Module Devis CRM

## But

Depuis la fiche d'une affaire (dès l'étape « Qualifié »), le bouton
**📄 Créer le devis** ouvre un éditeur de devis :

- lignes (désignation, unité, quantité, PU HT, TVA) et titres de section ;
- remise globale, acompte à la commande, validité, conditions ;
- totaux HT / TVA (par taux) / TTC calculés en direct ;
- PDF aux couleurs ID Maîtrise (`generateDevisPdf` dans `generators.js`).

**Envoyer** télécharge le PDF, ouvre le mail pré-rempli vers le client,
passe le devis en « Envoyé », l'affaire en « Devis envoyé » (montant estimé
= total HT) et programme une relance à J+7. **Accepté** propose de passer
l'affaire en « Gagné » (et donc de créer le chantier).

Numérotation : `DEV-AAAA-NNN`, séquentielle par année (index unique).

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
