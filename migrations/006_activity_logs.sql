-- ══════════════════════════════════════════════════════════════
-- MIGRATION 006 — ACTIVITY LOGS (journal d'audit admin)
-- ══════════════════════════════════════════════════════════════
-- Journal append-only des connexions, créations, modifications et
-- suppressions effectuées par les utilisateurs. Visible uniquement
-- des administrateurs (RLS), insertion possible par tout utilisateur
-- authentifié pour ses propres actions.
-- ══════════════════════════════════════════════════════════════

BEGIN;

-- 1. TABLE
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_email    TEXT,
  user_prenom   TEXT,
  user_role     TEXT,
  action        TEXT NOT NULL,       -- login | logout | create | update | delete
  entity_type   TEXT,                -- chantier | os | cr | task | contact | user | session | …
  entity_id     TEXT,                -- UUID ou libre (sessions n'ont pas d'id)
  entity_label  TEXT,                -- libellé lisible (ex. "CR n°12 — Villa X")
  metadata      JSONB,
  user_agent    TEXT
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_email ON public.activity_logs (user_email);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action     ON public.activity_logs (action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity     ON public.activity_logs (entity_type, entity_id);

-- 2. TRIGGER : enrichit automatiquement la ligne avec l'email/prénom/rôle
--    de l'appelant (depuis le JWT + authorized_users). Évite au client
--    de devoir deviner ses propres infos.
CREATE OR REPLACE FUNCTION public.set_activity_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email  TEXT;
  v_prenom TEXT;
  v_role   TEXT;
BEGIN
  v_email := lower(trim(auth.jwt()->>'email'));
  IF NEW.user_email IS NULL THEN
    NEW.user_email := v_email;
  END IF;
  IF NEW.user_prenom IS NULL OR NEW.user_role IS NULL THEN
    SELECT prenom, role INTO v_prenom, v_role
      FROM public.authorized_users
     WHERE lower(trim(email)) = v_email
     LIMIT 1;
    IF NEW.user_prenom IS NULL THEN NEW.user_prenom := v_prenom; END IF;
    IF NEW.user_role   IS NULL THEN NEW.user_role   := v_role;   END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_logs_enrich ON public.activity_logs;
CREATE TRIGGER trg_activity_logs_enrich
BEFORE INSERT ON public.activity_logs
FOR EACH ROW EXECUTE FUNCTION public.set_activity_user();

-- 3. RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Reset d'éventuelles policies antérieures
DROP POLICY IF EXISTS activity_logs_insert ON public.activity_logs;
DROP POLICY IF EXISTS activity_logs_select ON public.activity_logs;
DROP POLICY IF EXISTS activity_logs_update ON public.activity_logs;
DROP POLICY IF EXISTS activity_logs_delete ON public.activity_logs;

-- Insertion : tout utilisateur authentifié peut logger SES propres actions.
-- Le trigger ci-dessus remplit user_email avec l'email du JWT, donc impossible
-- d'écrire au nom d'un autre utilisateur même en fournissant une valeur (elle
-- est écrasée si NULL ; si non-NULL on ne la modifie pas, donc on vérifie
-- strictement la correspondance via le WITH CHECK).
CREATE POLICY activity_logs_insert ON public.activity_logs
FOR INSERT TO authenticated
WITH CHECK (
  user_email IS NULL
  OR lower(trim(user_email)) = lower(trim(auth.jwt()->>'email'))
);

-- Lecture : admins uniquement.
CREATE POLICY activity_logs_select ON public.activity_logs
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.authorized_users
    WHERE lower(trim(email)) = lower(trim(auth.jwt()->>'email'))
      AND actif = true
      AND role = 'admin'
  )
);

-- Suppression : admins uniquement (purge manuelle éventuelle).
CREATE POLICY activity_logs_delete ON public.activity_logs
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.authorized_users
    WHERE lower(trim(email)) = lower(trim(auth.jwt()->>'email'))
      AND actif = true
      AND role = 'admin'
  )
);

-- Pas de policy UPDATE → logs immuables (append-only).

COMMIT;
