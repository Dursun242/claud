-- ══════════════════════════════════════════════════════════════
-- MIGRATION 006b — TRIGGER d'enrichissement (2/3)
-- ══════════════════════════════════════════════════════════════
-- Étape 2/3 : fonction + trigger qui remplit automatiquement
-- user_email / user_prenom / user_role depuis le JWT et
-- authorized_users, pour que le client n'ait qu'à fournir
-- action/entity_type/entity_id/entity_label.
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_activity_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS trg_activity_logs_enrich ON public.activity_logs;

CREATE TRIGGER trg_activity_logs_enrich
BEFORE INSERT ON public.activity_logs
FOR EACH ROW EXECUTE FUNCTION public.set_activity_user();
