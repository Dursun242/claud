# Migration 003 (db-migrations) — RLS sur `proces_verbaux_reception`

## But

Activer Row Level Security sur la table `proces_verbaux_reception` créée
par `001_procès_verbaux_reception.sql`. Sans cette migration, la table
est exposée via PostgREST sans aucun filtrage : un MOA authentifié peut
récupérer tous les PV de tous les chantiers en interrogeant directement
l'API REST Supabase.

Le linter Supabase signale le problème via la règle
[`0013_rls_disabled_in_public`](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public).

## Prérequis

Les helpers RLS doivent exister :

- `public.is_staff()`, `public.is_admin()` → posés par
  `migrations/005_rls_proper.sql`
- `public.client_has_chantier(uuid)` → posé par 005, mis à jour par
  `migrations/019_client_user_id.sql`

Ces migrations du dossier `migrations/` doivent être appliquées avant.

## Policies posées

| Opération | Qui ? |
|---|---|
| `SELECT` | staff (admin / salarié) OU client du chantier (via `client_has_chantier`) |
| `INSERT` | staff uniquement |
| `UPDATE` | staff uniquement |
| `DELETE` | admin uniquement (un PV signé est un document contractuel) |

Aligné sur le pattern de `ordres_service` dans `005_rls_proper.sql`.

## Impact API

| Route | Client Supabase | Comportement |
|---|---|---|
| `GET /api/pv-reception/list` | `userClientFromToken` | RLS s'applique → MOA filtré sur ses chantiers |
| `POST /api/pv-reception/create` | `adminClient` (service role) | RLS bypassée → inchangé |
| `POST /api/pv-reception/decision` | `adminClient` | RLS bypassée → inchangé |
| `GET /api/pv-reception/sync-signatures` | `adminClient` | RLS bypassée → inchangé |

## Vérification post-migration

```sql
-- RLS bien activée
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'proces_verbaux_reception';
-- Attendu : relrowsecurity = t

-- Policies présentes
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'proces_verbaux_reception';
-- Attendu : 4 lignes (select / insert / update / delete)
```

## Rollback

Bloc commenté en fin de `003_rls_proces_verbaux_reception.sql`.
