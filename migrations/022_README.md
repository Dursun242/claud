# Migration 022 — TVA non applicable sur Ordre de Service

## But

Permet de marquer un Ordre de Service comme émis par un **auto-entrepreneur en
franchise de base de TVA** (article 293 B du CGI). Quand le flag est posé :

1. l'UI force tous les taux de TVA des prestations à 0 % et grise le sélecteur ;
2. le PDF généré affiche la mention légale obligatoire
   « TVA non applicable, art. 293 B du CGI » sous les totaux ;
3. l'export Excel/CSV inclut la même mention.

## Modifications

```sql
ALTER TABLE ordres_service
  ADD COLUMN IF NOT EXISTS tva_non_applicable BOOLEAN NOT NULL DEFAULT false;
```

## Impact

- **OS existants** : aucun. Le DEFAULT false rend la colonne transparente
  pour tout l'historique.
- **RLS** : aucune policy à modifier — `ordres_service` hérite déjà des
  règles posées par `005_rls_proper.sql`.
- **Front** : `SB.upsertOS` (dans `src/app/dashboards/shared.js`) lit/écrit
  désormais le champ. Le formulaire (`OSFormModal.js`) expose une case à
  cocher en tête de la section Prestations.
- **PDF / Excel** : `generators.js` ajoute la mention légale quand le flag
  est vrai.

## Rollback

```sql
ALTER TABLE ordres_service DROP COLUMN IF EXISTS tva_non_applicable;
```
