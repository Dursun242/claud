# Migration 026 — Lien devis Qonto ↔ CRM

## But

Depuis l'onglet **Qonto → Devis**, un bouton « → CRM » crée une opportunité
pré-remplie (titre, montant HT, étape « Devis envoyé » ou « Gagné » si le
devis est approuvé, contact retrouvé par email). L'id du devis est stocké
sur l'opportunité pour :

- afficher « Voir dans CRM » au lieu de « → CRM » sur un devis déjà importé ;
- garantir l'unicité (index unique partiel sur `qonto_quote_id`).

## SQL

```sql
ALTER TABLE crm_opportunites
  ADD COLUMN IF NOT EXISTS qonto_quote_id TEXT,
  ADD COLUMN IF NOT EXISTS qonto_quote_number TEXT;
```

## Sans la migration

Le bouton « → CRM » échoue avec un toast explicite (colonne inconnue). Le
reste du CRM fonctionne normalement.

## Rollback

```sql
DROP INDEX IF EXISTS uq_crm_opp_qonto_quote;
ALTER TABLE crm_opportunites DROP COLUMN IF EXISTS qonto_quote_id, DROP COLUMN IF EXISTS qonto_quote_number;
```
