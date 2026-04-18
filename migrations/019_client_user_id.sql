-- ══════════════════════════════════════════════════════════════
-- MIGRATION 019 — client_user_id sur chantiers (P0 RLS hardening)
-- ══════════════════════════════════════════════════════════════
--
-- Contexte : la migration 005 filtre les chantiers d'un MOA via le prénom
-- (chantiers.client ILIKE '%' || client_prenom() || '%'). C'est fragile :
-- deux clients qui s'appellent "Jean" voient les chantiers l'un de l'autre.
-- Le README de 005 note déjà cette dette.
--
-- Cette migration ajoute une colonne `client_user_id UUID` qui référence
-- directement `auth.users(id)`. Le matching RLS devient `client_user_id =
-- auth.uid()` — impossible à confondre.
--
-- APPROCHE EN DOUBLE SUPPORT (transition sans rupture) :
--   - On ajoute la colonne et on backfill les chantiers existants dès qu'on
--     trouve le user correspondant via authorized_users → auth.users.
--   - Un trigger AVANT INSERT/UPDATE remplit automatiquement client_user_id
--     à partir du champ texte `client` quand un seul user matche.
--   - La fonction `client_has_chantier()` accepte MAINTENANT les DEUX
--     mécanismes : UUID si la colonne est remplie, prénom sinon (fallback).
--   - Résultat : les chantiers déjà backfillés basculent sur le matching
--     robuste, les autres continuent de fonctionner comme avant. Aucun
--     chantier ne perd l'accès.
--
-- ROLLOUT : voir 019_README.md

BEGIN;

-- 1. Colonne client_user_id (nullable pour transition)
ALTER TABLE chantiers
  ADD COLUMN IF NOT EXISTS client_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Index pour que le filtre RLS reste rapide (RLS déclenche un scan
--    sur ce champ à chaque requête client).
CREATE INDEX IF NOT EXISTS idx_chantiers_client_user_id
  ON chantiers (client_user_id)
  WHERE client_user_id IS NOT NULL;

-- 3. Fonction de résolution : texte client → uid user (ou NULL).
--    SECURITY DEFINER pour pouvoir lire auth.users (inaccessible sinon).
--    Retourne NULL en cas d'ambiguïté (0 ou >1 match) — intentionnellement
--    conservateur : mieux vaut NULL + fallback prénom qu'un mauvais uid.
CREATE OR REPLACE FUNCTION public.resolve_client_user_id(client_text TEXT)
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  resolved UUID;
  match_count INT;
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
    AND client_text ILIKE '%' || au.prenom || '%'
  LIMIT 2; -- on s'arrête à 2 pour détecter l'ambiguïté

  IF match_count = 1 THEN
    RETURN resolved;
  END IF;
  RETURN NULL;
END;
$$;

-- 4. Backfill des chantiers existants.
UPDATE chantiers c
SET client_user_id = public.resolve_client_user_id(c.client)
WHERE c.client_user_id IS NULL
  AND c.client IS NOT NULL
  AND public.resolve_client_user_id(c.client) IS NOT NULL;

-- 5. Trigger AVANT INSERT/UPDATE : remplit client_user_id automatiquement
--    à chaque création ou modification d'un chantier si :
--      - la colonne est NULL (on ne touche pas un uid explicitement posé)
--      - le champ `client` permet une résolution non ambiguë
CREATE OR REPLACE FUNCTION public.chantiers_fill_client_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_user_id IS NULL AND NEW.client IS NOT NULL THEN
    NEW.client_user_id := public.resolve_client_user_id(NEW.client);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chantiers_fill_client_user_id ON chantiers;
CREATE TRIGGER trg_chantiers_fill_client_user_id
BEFORE INSERT OR UPDATE OF client, client_user_id ON chantiers
FOR EACH ROW
EXECUTE FUNCTION public.chantiers_fill_client_user_id();

-- 6. Nouvelle version de client_has_chantier : UUID d'abord, prénom en
--    fallback. L'ordre `UUID OR prénom` garantit le match le plus
--    précis possible quand les deux sont applicables.
CREATE OR REPLACE FUNCTION public.client_has_chantier(ch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM chantiers
    WHERE id = ch_id
      AND (
        -- Matching robuste par user_id (préféré, couvre les chantiers
        -- backfillés ou créés via le trigger depuis cette migration)
        (client_user_id IS NOT NULL AND client_user_id = auth.uid())
        -- Fallback prénom (couvre les chantiers où le trigger n'a pas
        -- pu résoudre — ambigu ou client pas encore invité côté auth)
        OR (
          client_user_id IS NULL
          AND public.client_prenom() IS NOT NULL
          AND client ILIKE '%' || public.client_prenom() || '%'
        )
      )
  )
$$;

-- 7. Mise à jour de la policy SELECT sur chantiers pour profiter de
--    la même logique dual-support. Les policies des tables filles
--    (taches, os, cr, planning, comments, attachments) utilisent déjà
--    client_has_chantier() — elles héritent automatiquement du fix.
DROP POLICY IF EXISTS "chantiers_select" ON chantiers;
CREATE POLICY "chantiers_select" ON chantiers FOR SELECT TO authenticated USING (
  public.is_staff()
  OR (client_user_id IS NOT NULL AND client_user_id = auth.uid())
  OR (
    client_user_id IS NULL
    AND public.client_prenom() IS NOT NULL
    AND client ILIKE '%' || public.client_prenom() || '%'
  )
);

COMMIT;

-- ──────────────────────────────────────────────────────────────
-- Vérifications post-migration (à lancer séparément, pas dans la TX)
-- ──────────────────────────────────────────────────────────────

-- Combien de chantiers ont été backfillés :
-- SELECT
--   COUNT(*) FILTER (WHERE client_user_id IS NOT NULL) AS backfillés,
--   COUNT(*) FILTER (WHERE client_user_id IS NULL)     AS à_compléter,
--   COUNT(*)                                            AS total
-- FROM chantiers;

-- Chantiers non backfillés à investiguer manuellement :
-- SELECT id, nom, client
-- FROM chantiers
-- WHERE client_user_id IS NULL
-- ORDER BY nom;

-- Pour chaque chantier non backfillé, chercher les candidats possibles :
-- SELECT au.email, au.prenom, au.role, u.id AS user_id
-- FROM authorized_users au
-- LEFT JOIN auth.users u ON lower(trim(u.email)) = lower(trim(au.email))
-- WHERE au.role = 'client' AND au.actif = true
-- ORDER BY au.prenom;
