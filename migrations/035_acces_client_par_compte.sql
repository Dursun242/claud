-- 035 — Accès client par compte uniquement (fin du rattachement par prénom)
--
-- Contexte : depuis 019, un chantier sans client_user_id restait visible
-- par tout client dont le prénom apparaît dans le champ texte `client`
-- (chantiers.client ILIKE '%' || client_prenom() || '%') : deux clients
-- « Jean » se voyaient mutuellement, « Al » voyait les chantiers d'« Alain ».
-- Les notifications choisissaient aussi le client destinataire par prénom.
--
-- 1. resolve_client_user_id(TEXT) (019) : toujours « un seul client actif
--    correspond, sinon NULL », mais le prénom doit apparaître en MOT ENTIER
--    (insensible à la casse, espaces autour du prénom ignorés, caractères
--    spéciaux échappés). Le tiret et le souligné comptent comme lettres :
--    « Jean » ne correspond pas à « Jean-Pierre Durand », « Jean-Pierre »
--    oui. Les lettres accentuées sont listées explicitement pour ne pas
--    dépendre de la collation de la base (« lodie » ≠ « Élodie »).
--    Droits de 034 réaffirmés (service role seulement).
-- 2. client_has_chantier(UUID) : uniquement client_user_id = auth.uid(),
--    plus l'exception démo (2 bis) : un compte démo « DémoMOA » voit les
--    chantiers is_demo, et seulement eux.
-- 3. Policy chantiers_select : is_staff() OR client_user_id = auth.uid()
--    OR (is_demo AND is_demo_client()).
-- 4. link_my_chantiers() : appelée par l'application à la connexion d'un
--    client ; rattache à son compte les chantiers sans compte dont le champ
--    `client` le désigne sans ambiguïté. Renvoie le nombre de chantiers
--    rattachés (0 si l'appelant n'est pas un client actif).
-- 5. client_accounts() : liste des comptes clients (pour le champ « Compte
--    client » de la fiche chantier). Équipe uniquement : pour un autre
--    compte, la fonction ne renvoie aucune ligne (pas d'erreur).
-- 6. Notifications : create_activity_notification (011, triggers INSERT) et
--    create_activity_notification_ex (012, triggers UPDATE / DELETE /
--    commentaires) — les deux sont utilisées. Le client destinataire est
--    désormais le compte chantiers.client_user_id (→ auth.users.email →
--    authorized_users actif, rôle client). Corps repris de 011 / 012, seul
--    le bloc « 2. Client MOA » change. Droits de 031 réaffirmés.
--
-- client_user_id reste NULLABLE : des chantiers internes n'ont pas de
-- client (voir 035_README.md).
--
-- AVANT D'APPLIQUER : lancer la requête de diagnostic de 035_README.md.
-- Les chantiers sans client_user_id ne sont plus visibles par aucun client
-- jusqu'à leur rattachement.
-- Idempotent : ré-exécutable sans erreur.

BEGIN;

-- ─── 1. Résolution texte client → compte, prénom en mot entier ─
CREATE OR REPLACE FUNCTION public.resolve_client_user_id(client_text TEXT)
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  resolved UUID;
  match_count INT;
  -- Caractères d'un mot : lettres / chiffres (selon la collation), lettres
  -- accentuées latines (indépendant de la collation), souligné, tiret.
  -- Tout autre caractère (espace, ponctuation, apostrophe…) ou le début /
  -- la fin du texte délimite le prénom.
  word_bound CONSTANT TEXT := '[^[:alnum:]À-ÖØ-öø-ÿŒœ_-]';
BEGIN
  IF client_text IS NULL OR trim(client_text) = '' THEN
    RETURN NULL;
  END IF;

  SELECT u.id, COUNT(*) OVER ()
    INTO resolved, match_count
  FROM authorized_users au
  JOIN auth.users u ON lower(trim(u.email)) = lower(trim(au.email))
  WHERE au.actif = true
    AND au.role = 'client'
    AND au.prenom IS NOT NULL
    AND trim(au.prenom) <> ''
    -- Les prospects démo partagent les chantiers de démo (voir 2 bis) :
    -- jamais rattachés à l'un d'eux.
    AND au.prenom <> 'DémoMOA'
    AND client_text ~* (
      '(^|' || word_bound || ')'
      || regexp_replace(trim(au.prenom), '([.^$*+?()\[\]{}|\\])', '\\\1', 'g')
      || '($|' || word_bound || ')'
    )
  LIMIT 2; -- on s'arrête à 2 pour détecter l'ambiguïté

  IF match_count = 1 THEN
    RETURN resolved;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_client_user_id(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_client_user_id(TEXT) TO service_role;

-- ─── 2 bis. Prospects démo ──────────────────────────────────────
-- Les comptes démo (client « DémoMOA », créés par api/admin/users) partagent
-- les chantiers de démo (is_demo = true, données fictives). Exception
-- limitée à ces chantiers : un compte démo ne voit aucun chantier réel.
CREATE OR REPLACE FUNCTION public.is_demo_client()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.client_prenom() = 'DémoMOA', false)
$$;

REVOKE ALL ON FUNCTION public.is_demo_client() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_demo_client() TO authenticated;

-- ─── 2. Accès aux données d'un chantier : compte uniquement ────
CREATE OR REPLACE FUNCTION public.client_has_chantier(ch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM chantiers
    WHERE id = ch_id
      AND (
        client_user_id = auth.uid()
        OR (is_demo IS TRUE AND public.is_demo_client())
      )
  )
$$;

-- ─── 3. Policy SELECT des chantiers ─────────────────────────────
DROP POLICY IF EXISTS "chantiers_select" ON chantiers;
CREATE POLICY "chantiers_select" ON chantiers FOR SELECT TO authenticated USING (
  public.is_staff()
  OR client_user_id = auth.uid()
  OR (is_demo IS TRUE AND public.is_demo_client())
);

-- ─── 4. Rattachement à la connexion d'un client ────────────────
CREATE OR REPLACE FUNCTION public.link_my_chantiers()
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_count INTEGER := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 0;
  END IF;

  -- L'appelant doit être un client actif (rapproché par email).
  IF NOT EXISTS (
    SELECT 1
    FROM auth.users u
    JOIN authorized_users au ON lower(trim(au.email)) = lower(trim(u.email))
    WHERE u.id = v_uid
      AND au.actif = true
      AND au.role = 'client'
  ) THEN
    RETURN 0;
  END IF;

  UPDATE chantiers c
  SET client_user_id = v_uid
  WHERE c.client_user_id IS NULL
    AND c.is_demo IS NOT TRUE
    AND public.resolve_client_user_id(c.client) = v_uid;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.link_my_chantiers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_my_chantiers() TO authenticated;

-- ─── 5. Comptes clients (équipe uniquement) ─────────────────────
-- Non-équipe : aucune ligne (pas d'erreur).
CREATE OR REPLACE FUNCTION public.client_accounts()
RETURNS TABLE(user_id uuid, prenom text, nom text, email text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id::uuid, au.prenom::text, au.nom::text, au.email::text
  FROM public.authorized_users au
  JOIN auth.users u ON lower(trim(u.email)) = lower(trim(au.email))
  WHERE public.is_staff()
    AND au.actif = true
    AND au.role = 'client'
    AND au.prenom IS DISTINCT FROM 'DémoMOA'  -- prospects démo : pas de rattachement
  ORDER BY au.prenom, au.nom
$$;

REVOKE ALL ON FUNCTION public.client_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_accounts() TO authenticated;

-- ─── 6. Notifications : client = compte rattaché au chantier ───
-- Corps de 011, seul le bloc 2 change (et la variable v_client_prenom,
-- devenue inutile, disparaît).
CREATE OR REPLACE FUNCTION public.create_activity_notification(
  p_entity_type TEXT,
  p_entity_id   UUID,
  p_chantier_id UUID,
  p_actor_email TEXT,
  p_title       TEXT,
  p_body        TEXT,
  p_target_tab  TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r                RECORD;
BEGIN
  -- 1. Staff (admin + salarié) : TOUS les actifs
  FOR r IN
    SELECT DISTINCT lower(trim(email)) AS email
    FROM authorized_users
    WHERE actif = true
      AND role IN ('admin', 'salarié', 'salarie')
      AND email IS NOT NULL
  LOOP
    INSERT INTO notifications (recipient_email, actor_email, kind, entity_type, entity_id, chantier_id, title, body, target_tab)
    VALUES (r.email, p_actor_email, 'create', p_entity_type, p_entity_id, p_chantier_id, p_title, p_body, p_target_tab);
  END LOOP;

  -- 2. Client MOA du chantier (compte rattaché : chantiers.client_user_id)
  IF p_chantier_id IS NOT NULL THEN
    FOR r IN
      SELECT DISTINCT lower(trim(au.email)) AS email
      FROM chantiers c
      JOIN auth.users u ON u.id = c.client_user_id
      JOIN authorized_users au ON lower(trim(au.email)) = lower(trim(u.email))
      WHERE c.id = p_chantier_id
        AND au.actif = true
        AND au.role = 'client'
        AND au.email IS NOT NULL
    LOOP
      INSERT INTO notifications (recipient_email, actor_email, kind, entity_type, entity_id, chantier_id, title, body, target_tab)
      VALUES (r.email, p_actor_email, 'create', p_entity_type, p_entity_id, p_chantier_id, p_title, p_body, p_target_tab);
    END LOOP;
  END IF;
END;
$$;

-- Corps de 012, seul le bloc 2 change.
CREATE OR REPLACE FUNCTION public.create_activity_notification_ex(
  p_kind        TEXT,
  p_entity_type TEXT,
  p_entity_id   UUID,
  p_chantier_id UUID,
  p_actor_email TEXT,
  p_title       TEXT,
  p_body        TEXT,
  p_target_tab  TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r                RECORD;
BEGIN
  -- 1. Staff (admin + salarié) : TOUS les actifs
  FOR r IN
    SELECT DISTINCT lower(trim(email)) AS email
    FROM authorized_users
    WHERE actif = true
      AND role IN ('admin', 'salarié', 'salarie')
      AND email IS NOT NULL
  LOOP
    INSERT INTO notifications (recipient_email, actor_email, kind, entity_type, entity_id, chantier_id, title, body, target_tab)
    VALUES (r.email, p_actor_email, p_kind, p_entity_type, p_entity_id, p_chantier_id, p_title, p_body, p_target_tab);
  END LOOP;

  -- 2. Client MOA du chantier (compte rattaché : chantiers.client_user_id)
  IF p_chantier_id IS NOT NULL THEN
    FOR r IN
      SELECT DISTINCT lower(trim(au.email)) AS email
      FROM chantiers c
      JOIN auth.users u ON u.id = c.client_user_id
      JOIN authorized_users au ON lower(trim(au.email)) = lower(trim(u.email))
      WHERE c.id = p_chantier_id
        AND au.actif = true
        AND au.role = 'client'
        AND au.email IS NOT NULL
    LOOP
      INSERT INTO notifications (recipient_email, actor_email, kind, entity_type, entity_id, chantier_id, title, body, target_tab)
      VALUES (r.email, p_actor_email, p_kind, p_entity_type, p_entity_id, p_chantier_id, p_title, p_body, p_target_tab);
    END LOOP;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_activity_notification(TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.create_activity_notification_ex(TEXT, TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

COMMIT;

-- Vérifications :
-- 1) resolve_client_user_id / create_activity_notification(_ex) : false ;
--    link_my_chantiers / client_accounts : true
-- SELECT p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
--        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon
-- FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
--   AND p.proname IN ('resolve_client_user_id', 'create_activity_notification',
--                     'create_activity_notification_ex', 'link_my_chantiers', 'client_accounts');
-- 2) Plus de prénom dans la policy
-- SELECT policyname, qual FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'chantiers' AND policyname = 'chantiers_select';
