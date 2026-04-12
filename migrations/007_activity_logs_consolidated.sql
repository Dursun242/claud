-- ══════════════════════════════════════════════════════════════
-- MIGRATION 007 — ACTIVITY LOGS (version consolidée & idempotente)
-- ══════════════════════════════════════════════════════════════
-- Remplace les 006a → 006e qui étaient fragiles à exécuter dans le
-- bon ordre. Ce fichier est auto-suffisant : table, trigger (avec
-- SET row_security = off), fonction is_logs_admin, policies RLS
-- admin-only, plus une fonction purge_activity_logs (rétention 90j
-- par défaut) et un RPC distinct users pour le filtre UI.
--
-- Idempotent : CREATE OR REPLACE + IF NOT EXISTS partout. Peut être
-- ré-exécuté sans dommage.
--
-- Pour mobile Safari (copier-coller tronqué sur gros SQL), garder
-- le fichier ≤ 150 lignes est important. Si plus long, splitter.
-- ══════════════════════════════════════════════════════════════

-- 1. TABLE
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_email    TEXT,
  user_prenom   TEXT,
  user_role     TEXT,
  action        TEXT NOT NULL,
  entity_type   TEXT,
  entity_id     TEXT,
  entity_label  TEXT,
  metadata      JSONB,
  user_agent    TEXT
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_email ON public.activity_logs (user_email);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action     ON public.activity_logs (action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity     ON public.activity_logs (entity_type, entity_id);

-- 2. TRIGGER : enrichit automatiquement l'auteur depuis le JWT et
--    authorized_users. SECURITY DEFINER + SET row_security = off
--    pour bypasser la RLS récursive sur authorized_users.
CREATE OR REPLACE FUNCTION public.set_activity_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $func$
DECLARE
  v_email  TEXT;
  v_prenom TEXT;
  v_role   TEXT;
BEGIN
  v_email := lower(trim(auth.jwt()->>'email'));
  IF NEW.user_email IS NULL THEN NEW.user_email := v_email; END IF;
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
$func$;

DROP TRIGGER IF EXISTS trg_activity_logs_enrich ON public.activity_logs;
CREATE TRIGGER trg_activity_logs_enrich
BEFORE INSERT ON public.activity_logs
FOR EACH ROW EXECUTE FUNCTION public.set_activity_user();

-- 3. FONCTION HELPER : is_logs_admin (RLS-safe)
CREATE OR REPLACE FUNCTION public.is_logs_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $func$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.authorized_users
    WHERE lower(trim(email)) = lower(trim(auth.jwt()->>'email'))
      AND actif = true
      AND role = 'admin'
  );
END;
$func$;

-- 4. RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activity_logs_insert ON public.activity_logs;
DROP POLICY IF EXISTS activity_logs_select ON public.activity_logs;
DROP POLICY IF EXISTS activity_logs_update ON public.activity_logs;
DROP POLICY IF EXISTS activity_logs_delete ON public.activity_logs;

CREATE POLICY activity_logs_insert ON public.activity_logs
FOR INSERT TO authenticated
WITH CHECK (
  user_email IS NULL
  OR lower(trim(user_email)) = lower(trim(auth.jwt()->>'email'))
);

CREATE POLICY activity_logs_select ON public.activity_logs
FOR SELECT TO authenticated USING (public.is_logs_admin());

CREATE POLICY activity_logs_delete ON public.activity_logs
FOR DELETE TO authenticated USING (public.is_logs_admin());

-- 5. PURGE : rétention 90j par défaut, admin-only, retourne le
--    nombre de lignes supprimées. À appeler manuellement depuis
--    LogsV (bouton "Purger") ou via pg_cron.
CREATE OR REPLACE FUNCTION public.purge_activity_logs(p_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $func$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT public.is_logs_admin() THEN
    RAISE EXCEPTION 'Seuls les admins peuvent purger le journal.';
  END IF;
  IF p_days < 1 THEN p_days := 1; END IF;
  DELETE FROM public.activity_logs
   WHERE created_at < NOW() - make_interval(days => p_days);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.purge_activity_logs(INTEGER) TO authenticated;

-- 6. DISTINCT USERS : liste des utilisateurs présents dans les logs,
--    pour alimenter le filtre UI (évite un SELECT DISTINCT coûteux
--    côté client).
CREATE OR REPLACE FUNCTION public.activity_logs_distinct_users()
RETURNS TABLE (email TEXT, prenom TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $func$
BEGIN
  IF NOT public.is_logs_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  RETURN QUERY
    SELECT DISTINCT ON (al.user_email)
           al.user_email, al.user_prenom
      FROM public.activity_logs al
     WHERE al.user_email IS NOT NULL
     ORDER BY al.user_email, al.created_at DESC;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.activity_logs_distinct_users() TO authenticated;
