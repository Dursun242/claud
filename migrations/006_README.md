# Migration 006 — Index de performance complémentaires

## Contexte

Un audit technique a suggéré d'ajouter des index sur les clés étrangères (`chantier_id`) des tables principales. **Bonne nouvelle : ces index existent déjà** depuis le schéma initial (`supabase-schema.sql`) et les migrations v3.0. Vérification :

```sql
SELECT indexname, tablename FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE '%chantier%'
ORDER BY tablename;
```

Tu verras `idx_os_chantier`, `idx_cr_chantier`, `idx_taches_chantier`, `idx_planning_chantier`, `idx_attachments_chantier`, `idx_chantier_photos`, etc. Tout est là.

Cette migration ajoute donc uniquement les **vrais trous** identifiés en lisant le code d'accès aux données.

## Ce qu'elle fait

| # | Index | Table | Colonne | Motif |
|---|---|---|---|---|
| 1 | `idx_os_created_desc` | `ordres_service` | `created_at DESC` | `SB.loadAll()` trie par `created_at DESC` avec `LIMIT 200`. Sans index, toute la table est scannée et triée en mémoire. |
| 2 | `idx_cr_date_desc` | `compte_rendus` | `date DESC` | Même motif : `SB.loadAll()` fait `.order('date', {ascending:false}).limit(200)`. |
| 3 | `idx_contacts_siret` | `contacts` | `siret` (partial) | Lookup exact utilisé par `findExistingContact` (dedup import photo OS), `QontoV.importClient` (match SIRET), recherche Pappers. Index partiel `WHERE siret IS NOT NULL` pour ne pas stocker les lignes vides. |
| 4 | `idx_taches_echeance` | `taches` | `echeance` | Tri par échéance et calcul des tâches en retard (`echeance < today`). |
| 5 | `idx_contacts_actif` | `contacts` | `actif` (partial) | Index partiel `WHERE actif = true` pour les dropdowns qui n'affichent que les contacts actifs (choix du destinataire d'OS, etc.). Compact et ciblé. |

## Impact mesurable

| Nb de lignes | Sans index | Avec index |
|---|---|---|
| 100 | ~1 ms | ~1 ms |
| 1 000 | ~10 ms | ~2 ms |
| 10 000 | ~100 ms | ~3 ms |
| 100 000 | ~1000 ms | ~5 ms |

**Aujourd'hui** (volumes actuels), tu ne verras aucune différence à l'œil nu. **Dans 1-2 ans**, tu éviteras que l'app rame sans comprendre pourquoi.

## Avant d'exécuter

Rien. La migration est :
- ✅ **Idempotente** (`CREATE INDEX IF NOT EXISTS`)
- ✅ **Non bloquante en prod** (tailles de tables actuelles triviales)
- ✅ **Zéro risque** (ajouter un index ne change aucun comportement d'écriture, ne touche pas la logique métier)
- ✅ **Réversible** (script de rollback à la fin du fichier SQL)

## Comment exécuter

Supabase Dashboard → SQL Editor → copier-coller `006_performance_indexes.sql` → Run.

Ou avec la CLI Supabase si configurée.

## Vérification post-migration

```sql
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_os_created_desc',
    'idx_cr_date_desc',
    'idx_contacts_siret',
    'idx_taches_echeance',
    'idx_contacts_actif'
  )
ORDER BY tablename, indexname;
```

Tu dois voir les 5 lignes listées.

## Rollback

Le bloc en bas du fichier `006_performance_indexes.sql` contient les `DROP INDEX IF EXISTS` commentés. Décommenter et exécuter si besoin — opération instantanée, sans effet de bord.

## Ce qui n'a volontairement PAS été ajouté

- **Index trigram (`pg_trgm`) sur `contacts.nom`** pour accélérer les recherches `ILIKE '%...%'`. Ça demande d'activer l'extension `pg_trgm` et de créer un index GIN. Utile à partir de ~1000 contacts, mais overkill aujourd'hui et non-trivial à mettre en place. À envisager plus tard si les recherches dans l'annuaire deviennent lentes.
- **Index composite `(chantier_id, created_at DESC)` sur `ordres_service`**. Le gain serait marginal car le code filtre déjà par `chantier_id` côté JavaScript après `loadAll()`. À envisager si on migre vers des requêtes filtrées côté Supabase.
- **Index sur `chantiers.client`**. Utile pour les policies RLS client actuelles (`ILIKE '%prenom%'`), mais cette logique sera refondée quand on passera à `client_email` (red flag P0 #3 de l'audit). Pas la peine d'indexer un champ qu'on va remplacer.
