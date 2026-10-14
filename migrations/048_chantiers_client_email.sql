-- 048 — Chantiers : adresse email (Gmail) du client à rattacher
--
-- Dans la fiche chantier, l'équipe saisit l'adresse Gmail du client qui
-- n'a pas encore de compte (api/clients/invite) :
--   - le client est autorisé (authorized_users, rôle client) et reçoit, si
--     on le souhaite, un mail d'invitation ;
--   - chantiers.client_email garde l'adresse ; à sa première connexion avec
--     Google, link_my_chantiers() rattache le chantier à son compte
--     (client_user_id) en plus du rattachement d'après le nom (035).
-- Idempotent : ré-exécutable sans erreur. À appliquer après 047.

BEGIN;

ALTER TABLE public.chantiers
  ADD COLUMN IF NOT EXISTS client_email TEXT;

CREATE OR REPLACE FUNCTION public.link_my_chantiers()
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_email TEXT;
  v_count INTEGER := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 0;
  END IF;

  -- L'appelant doit être un client actif (rapproché par email).
  SELECT lower(trim(u.email)) INTO v_email
  FROM auth.users u
  JOIN authorized_users au ON lower(trim(au.email)) = lower(trim(u.email))
  WHERE u.id = v_uid
    AND au.actif = true
    AND au.role = 'client';
  IF v_email IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE chantiers c
  SET client_user_id = v_uid
  WHERE c.client_user_id IS NULL
    AND c.is_demo IS NOT TRUE
    AND (
      lower(trim(coalesce(c.client_email, ''))) = v_email
      OR (trim(coalesce(c.client_email, '')) = '' AND public.resolve_client_user_id(c.client) = v_uid)
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.link_my_chantiers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_my_chantiers() TO authenticated;

COMMIT;
