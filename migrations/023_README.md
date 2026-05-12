# Migration 023 — Sync Google Tasks bidirectionnelle

## But

Synchroniser dans les deux sens la table `taches` d'ID Maîtrise avec une liste Google Tasks dédiée, pour le compte admin (Dursun). Inclut :

- Création des tâches → des deux côtés
- Modifications (titre, échéance, statut) → des deux côtés
- Cochage / décochage → des deux côtés
- Suppression → des deux côtés (bidi complète)

Limite : un seul compte Google connecté à la fois (`google_oauth_state` est mono-ligne, `id = 1`). Pour évoluer en multi-utilisateur plus tard : remplacer `id` par `user_id UUID REFERENCES auth.users(id)`.

## Prérequis Google Cloud Console (à faire AVANT)

1. Aller sur [console.cloud.google.com](https://console.cloud.google.com)
2. Créer un projet `ID Maîtrise — Tasks Sync` (ou réutiliser un projet existant).
3. **Activer l'API Google Tasks** : APIs & Services → Library → recherche `Tasks API` → Enable.
4. **OAuth consent screen** :
   - User Type : `External` (sauf si Workspace).
   - App name : `ID Maîtrise`
   - User support email + developer email : ton email.
   - Scopes → Add : `https://www.googleapis.com/auth/tasks`
   - Test users → ajouter ton email Google perso (sinon Google bloque tant que l'app est en "Testing").
5. **Credentials → Create OAuth client ID** :
   - Application type : `Web application`
   - Authorized redirect URIs :
     - Dev : `http://localhost:3000/api/google-tasks/callback`
     - Prod : `https://<ton-domaine>/api/google-tasks/callback`
6. Note le **Client ID** et le **Client secret**.

## Variables d'environnement

Ajouter dans `.env.local` (dev) et dans les secrets prod :

```bash
GOOGLE_TASKS_CLIENT_ID=<le client id>.apps.googleusercontent.com
GOOGLE_TASKS_CLIENT_SECRET=<le client secret>
GOOGLE_TASKS_REDIRECT_URI=http://localhost:3000/api/google-tasks/callback
# En prod, ajuste GOOGLE_TASKS_REDIRECT_URI à l'URL publique.

# Secret partagé pour autoriser le cron à appeler /api/google-tasks/sync
# Génère avec : openssl rand -hex 32
GOOGLE_TASKS_CRON_SECRET=<32 octets hex aléatoires>
```

## Application

```sql
-- Supabase SQL Editor :
\i migrations/023_google_tasks_sync.sql
```

ou copier-coller le contenu du `.sql` directement.

## Vérification post-migration

```sql
-- Colonnes ajoutées sur taches
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'taches'
  AND column_name IN ('google_task_id', 'google_etag', 'synced_at');
-- Doit retourner 3 lignes.

-- Table google_oauth_state créée et vide
SELECT count(*) FROM google_oauth_state;  -- 0

-- RLS active
SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'google_oauth_state';
-- relrowsecurity = true
```

## Connexion initiale (après déploiement code + env)

1. Connecte-toi à ID Maîtrise avec ton compte admin.
2. Va dans **Paramètres → Intégrations** (ou le bouton "Connecter Google Tasks" qui apparaîtra dans l'UI une fois Phase 1.5 livrée).
3. Une popup Google s'ouvre, accepte les permissions.
4. Retour sur l'app → "Connecté en tant que <email>".
5. La première sync crée automatiquement une liste Google Tasks nommée `ID Maîtrise`.

## Désactivation / disconnection

```sql
DELETE FROM google_oauth_state;  -- révoque la liaison côté Supabase
-- Le refresh_token reste valide côté Google jusqu'à révocation manuelle
-- depuis https://myaccount.google.com/permissions
```

Les colonnes `google_task_id` / `google_etag` / `synced_at` restent sur les tâches mais deviennent inertes.

## Rollback complet

```sql
DROP TABLE IF EXISTS google_oauth_state;
ALTER TABLE taches
  DROP COLUMN IF EXISTS google_task_id,
  DROP COLUMN IF EXISTS google_etag,
  DROP COLUMN IF EXISTS synced_at;
DROP FUNCTION IF EXISTS google_oauth_state_set_updated_at();
```

## Cron (Phase 3)

Pour la sync entrante toutes les 10 min :

**Option A — Supabase pg_cron** :
```sql
SELECT cron.schedule(
  'google-tasks-sync',
  '*/10 * * * *',
  $$SELECT net.http_post(
    url := 'https://<app>/api/google-tasks/sync',
    headers := jsonb_build_object('Authorization', 'Bearer <GOOGLE_TASKS_CRON_SECRET>')
  )$$
);
```

**Option B — Vercel Cron** :
```json
// vercel.json
{ "crons": [{ "path": "/api/google-tasks/sync", "schedule": "*/10 * * * *" }] }
```

**Option C — Externe (cron-job.org, GitHub Actions…)** : POST sur `/api/google-tasks/sync` avec header `Authorization: Bearer <GOOGLE_TASKS_CRON_SECRET>` toutes les 10 min.
