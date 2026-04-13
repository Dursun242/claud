# Migration 008 — Client peut gérer les tâches

## Pourquoi

Le gérant veut que les MOA (clients) puissent :
- **Créer** une nouvelle tâche sur leur chantier (depuis le dashboard ou la vue détail chantier)
- **Modifier** une tâche (cocher Terminé, changer priorité, échéance…)

Avant cette migration, les policies RLS sur la table `taches` n'autorisaient que le staff (admin/salarié) à faire INSERT/UPDATE/DELETE.

## Ce que fait la migration

| Policy | Avant | Après |
|---|---|---|
| `taches_insert` | `is_staff()` | `is_staff() OR client_has_chantier(chantier_id)` |
| `taches_update` | `is_staff()` | `is_staff() OR client_has_chantier(chantier_id)` |
| `taches_delete` | `is_staff()` | `is_staff()` (inchangé — sécurité) |

La suppression reste réservée au staff pour éviter qu'un client n'efface par erreur une tâche importante créée par son MOE.

## Comment l'appliquer

1. Supabase Dashboard → **SQL Editor**
2. Copier-coller le contenu de `008_client_can_manage_tasks.sql`
3. **Run**

Idempotent : le script `DROP POLICY IF EXISTS` avant chaque `CREATE POLICY`, donc peut être ré-exécuté sans risque.

## Rollback

Pour revenir à l'état précédent (staff uniquement) :

```sql
BEGIN;
DROP POLICY IF EXISTS "taches_insert" ON taches;
DROP POLICY IF EXISTS "taches_update" ON taches;
DROP POLICY IF EXISTS "taches_delete" ON taches;

CREATE POLICY "taches_insert" ON taches FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());
CREATE POLICY "taches_update" ON taches FOR UPDATE TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY "taches_delete" ON taches FOR DELETE TO authenticated
  USING (public.is_staff());
COMMIT;
```
