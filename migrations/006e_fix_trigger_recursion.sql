-- ══════════════════════════════════════════════════════════════
-- MIGRATION 006e — FIX récursion dans le trigger d'enrichissement
-- ══════════════════════════════════════════════════════════════
-- Même souci que 006d : le trigger set_activity_user() lit
-- authorized_users, ce qui déclenche la policy RLS récursive de
-- cette table. On force le bypass via "SET row_security = off".
--
-- À exécuter APRÈS 006d (ordre : 006a → 006b → 006c → 006d → 006e).
-- ══════════════════════════════════════════════════════════════

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
$func$;
