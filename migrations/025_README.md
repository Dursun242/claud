# Migration 025 — Module CRM

## But

Ajoute un **pipeline commercial** à l'application : suivre les prospects et
affaires potentielles *avant* qu'elles ne deviennent des chantiers, et garder
l'historique des échanges (appels, emails, réunions, visites).

## Tables

| Table | Rôle |
|---|---|
| `crm_opportunites` | Une ligne par affaire. Étape (`Prospect` → `Qualifié` → `Devis envoyé` → `Négociation` → `Gagné` / `Perdu`), montant estimé, probabilité, contact rattaché, chantier créé à la conversion. |
| `crm_interactions` | Historique des échanges rattachés à une opportunité et/ou un contact. Chaque interaction peut porter une **prochaine action** datée (relance), cochée quand elle est faite. |

## Sécurité

- RLS activée sur les deux tables, policy `FOR ALL` réservée à
  `public.is_staff()` (admin / salarié), comme `contacts`.
- Un client MOA n'a **aucun** accès au pipeline.
- Les FK vers `contacts` et `chantiers` sont en `ON DELETE SET NULL` : supprimer
  un contact ou un chantier ne casse jamais le CRM. Supprimer une opportunité
  supprime ses interactions (`ON DELETE CASCADE`).

## Front

- Page `src/app/pages/CrmV.js` (onglet **CRM**, raccourci `g` puis `v`).
- Accès données : `src/app/lib/crmDb.js` (hors de `shared.js` pour ne pas
  aggraver la dette documentée).
- Hook React Query : `src/app/hooks/useCrmData.js`.
- Logique pure (étapes, KPI, relances en retard) : `src/app/lib/crm.js`, testée.
- Conversion « Gagné → Chantier » : crée le chantier via `SB.upsertChantier`,
  rattache le contact via `contact_chantiers`, puis pose `chantier_id` sur
  l'opportunité.

## Sans la migration

Tant que la migration n'est pas appliquée, la page CRM affiche un pipeline
vide avec un bandeau d'avertissement (le `SELECT` échoue avec « relation does
not exist », intercepté dans `crmDb.js`). Aucun crash.

## Rollback

```sql
DROP TABLE IF EXISTS public.crm_interactions;
DROP TABLE IF EXISTS public.crm_opportunites;
DROP FUNCTION IF EXISTS public.crm_set_updated_at();
```
