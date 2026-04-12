-- ══════════════════════════════════════════════════════════════
-- MIGRATION 006d — FIX infinite recursion (hotfix 006c)
-- ══════════════════════════════════════════════════════════════
-- La policy activity_logs_select interroge authorized_users, qui a
-- elle-même une policy RLS (depuis migration 005) appelant is_admin(),
-- qui interroge à nouveau authorized_users → récursion infinie.
--
-- Fix : une fonction SECURITY DEFINER avec "SET row_security = off"
-- qui bypass explicitement la RLS le temps de vérifier le rôle.
-- Les policies d'activity_logs utilisent ensuite cette fonction.
-- ══════════════════════════════════════════════════════════════

-- 1. Helper RLS-safe (bypass explicite)
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

-- 2. Recréer les policies d'activity_logs en utilisant la fonction
DROP POLICY IF EXISTS activity_logs_select ON public.activity_logs;
DROP POLICY IF EXISTS activity_logs_delete ON public.activity_logs;

CREATE POLICY activity_logs_select ON public.activity_logs
FOR SELECT TO authenticated
USING (public.is_logs_admin());

CREATE POLICY activity_logs_delete ON public.activity_logs
FOR DELETE TO authenticated
USING (public.is_logs_admin());
