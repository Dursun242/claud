-- ══════════════════════════════════════════════════════════════
-- MIGRATION 006c — RLS admin-only (3/3)
-- ══════════════════════════════════════════════════════════════
-- Étape 3/3 : active la RLS et crée les policies.
-- SELECT / DELETE = admins uniquement.
-- INSERT = tout utilisateur authentifié (pour ses propres logs :
--   le trigger force user_email à l'email du JWT).
-- Pas de policy UPDATE = logs immuables (append-only).
-- ══════════════════════════════════════════════════════════════

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
FOR SELECT TO authenticated
USING (
  lower(trim(auth.jwt()->>'email')) IN (
    SELECT lower(trim(email)) FROM public.authorized_users
    WHERE actif = true AND role = 'admin'
  )
);

CREATE POLICY activity_logs_delete ON public.activity_logs
FOR DELETE TO authenticated
USING (
  lower(trim(auth.jwt()->>'email')) IN (
    SELECT lower(trim(email)) FROM public.authorized_users
    WHERE actif = true AND role = 'admin'
  )
);
