-- ══════════════════════════════════════════════════════════════
-- MIGRATION 023 — Sync bidirectionnelle Google Tasks (admin uniquement)
-- ══════════════════════════════════════════════════════════════
--
-- Contexte : ajouter une synchronisation 2-sens entre la table `taches`
-- d'ID Maîtrise et la liste Google Tasks de l'utilisateur admin.
-- Pour l'instant un seul compte Google connecté à la fois (Dursun) →
-- table `google_oauth_state` avec une unique ligne.
--
-- Voir 023_README.md pour la procédure complète (Google Cloud Console,
-- variables d'env, rollout).
--
-- Rollback : DROP TABLE google_oauth_state + ALTER TABLE taches DROP COLUMN
-- google_task_id, google_etag, synced_at. Idempotent.

BEGIN;

-- 1. Colonnes de tracking sur taches
ALTER TABLE taches
  ADD COLUMN IF NOT EXISTS google_task_id TEXT,
  ADD COLUMN IF NOT EXISTS google_etag    TEXT,
  ADD COLUMN IF NOT EXISTS synced_at      TIMESTAMPTZ;

-- Index sur google_task_id pour le diff côté pull (lookup par ID Google).
CREATE INDEX IF NOT EXISTS idx_taches_google_task_id
  ON taches(google_task_id)
  WHERE google_task_id IS NOT NULL;

-- 2. Table google_oauth_state : ligne unique (id = 1).
-- Stocke le refresh_token (long-lived) + le dernier access_token caché
-- avec son expiration pour éviter de re-refresh à chaque appel.
CREATE TABLE IF NOT EXISTS google_oauth_state (
  id                       INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  refresh_token            TEXT NOT NULL,
  access_token             TEXT,
  access_token_expires_at  TIMESTAMPTZ,
  google_email             TEXT,                -- pour afficher "Connecté en tant que X"
  tasks_list_id            TEXT,                -- ID de la liste Google Tasks dédiée "ID Maîtrise"
  connected_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_full_sync_at        TIMESTAMPTZ,
  last_sync_error          TEXT,                -- dernier message d'erreur (debug)
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. RLS : seul le service_role peut toucher cette table.
-- Le refresh_token est un secret — JAMAIS exposé à l'anon ou aux users.
-- Toutes les opérations passent par /api/google-tasks/* qui utilise la
-- service role key côté serveur.
ALTER TABLE google_oauth_state ENABLE ROW LEVEL SECURITY;

-- Pas de policy CREATE → tout est refusé sauf via service_role qui
-- bypasse RLS. C'est volontaire.

-- 4. Trigger pour maintenir updated_at automatiquement.
CREATE OR REPLACE FUNCTION google_oauth_state_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_google_oauth_state_updated_at ON google_oauth_state;
CREATE TRIGGER trg_google_oauth_state_updated_at
  BEFORE UPDATE ON google_oauth_state
  FOR EACH ROW
  EXECUTE FUNCTION google_oauth_state_set_updated_at();

COMMIT;

-- Vérification post-migration :
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'taches' AND column_name LIKE 'google%' OR column_name = 'synced_at';
-- SELECT * FROM google_oauth_state;
