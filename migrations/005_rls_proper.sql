-- ══════════════════════════════════════════════════════════════
-- MIGRATION 005 — RLS PROPER (security fix)
-- ══════════════════════════════════════════════════════════════
--
-- REMPLACE TOUTES LES POLICIES "Allow all" QUI LAISSAIENT LA BASE
-- COMPLÈTEMENT OUVERTE À QUICONQUE AVEC LA anon KEY.
--
-- ⚠️ AVANT D'EXÉCUTER :
--   1. Faire un snapshot Supabase (Database → Backups)
--   2. Vérifier qu'il y a AU MOINS un user avec role='admin' dans
--      authorized_users (sinon tu te lockes out) :
--        SELECT * FROM authorized_users WHERE role='admin' AND actif=true;
--   3. Tester d'abord en staging si possible
--
-- ROLLBACK :
--   Exécuter migrations/005_rls_proper_rollback.sql
--
-- ══════════════════════════════════════════════════════════════

BEGIN;

-- ══════════════════════════════════════════════════════════════
-- 1. FONCTIONS HELPER (SECURITY DEFINER → bypass RLS pour éviter
--    la récursion infinie quand une policy interroge authorized_users)
-- ══════════════════════════════════════════════════════════════

-- Email de l'utilisateur courant (lowercase, trim)
CREATE OR REPLACE FUNCTION public.auth_email()
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  SELECT lower(trim(auth.jwt()->>'email'))
$$;

-- Staff = admin ou salarié (avec ou sans accent, migration a introduit les deux)
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM authorized_users
    WHERE lower(trim(email)) = public.auth_email()
      AND actif = true
      AND role IN ('admin', 'salarié', 'salarie')
  )
$$;

-- Admin strict
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM authorized_users
    WHERE lower(trim(email)) = public.auth_email()
      AND actif = true
      AND role = 'admin'
  )
$$;

-- Prénom du client courant (null s'il n'est pas un client)
CREATE OR REPLACE FUNCTION public.client_prenom()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT prenom FROM authorized_users
  WHERE lower(trim(email)) = public.auth_email()
    AND actif = true
    AND role = 'client'
  LIMIT 1
$$;

-- Le client courant a-t-il accès à ce chantier ?
-- (match par prénom — c'est fragile mais c'est ce que fait loadForClient
--  dans dashboards/shared.js:237)
CREATE OR REPLACE FUNCTION public.client_has_chantier(ch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN public.client_prenom() IS NULL THEN false
      ELSE EXISTS (
        SELECT 1 FROM chantiers
        WHERE id = ch_id
          AND client ILIKE '%' || public.client_prenom() || '%'
      )
    END
$$;

-- ══════════════════════════════════════════════════════════════
-- 2. CHANTIERS
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all" ON chantiers;
DROP POLICY IF EXISTS "authenticated_can_view_chantiers" ON chantiers;
DROP POLICY IF EXISTS "admin_can_modify_chantiers" ON chantiers;

ALTER TABLE chantiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chantiers_select" ON chantiers FOR SELECT TO authenticated USING (
  public.is_staff()
  OR (
    public.client_prenom() IS NOT NULL
    AND client ILIKE '%' || public.client_prenom() || '%'
  )
);

CREATE POLICY "chantiers_insert" ON chantiers FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY "chantiers_update" ON chantiers FOR UPDATE TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY "chantiers_delete" ON chantiers FOR DELETE TO authenticated
  USING (public.is_admin());

-- ══════════════════════════════════════════════════════════════
-- 3. CONTACTS (staff only — un MOA n'a pas à voir la liste des artisans)
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all" ON contacts;
DROP POLICY IF EXISTS "authenticated_can_view_contacts" ON contacts;
DROP POLICY IF EXISTS "admin_can_modify_contacts" ON contacts;

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contacts_all" ON contacts FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- ══════════════════════════════════════════════════════════════
-- 4. CONTACT_CHANTIERS (staff only)
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all" ON contact_chantiers;
DROP POLICY IF EXISTS "authenticated_can_use_contact_chantiers" ON contact_chantiers;

ALTER TABLE contact_chantiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contact_chantiers_all" ON contact_chantiers FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- ══════════════════════════════════════════════════════════════
-- 5. TÂCHES
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all" ON taches;
DROP POLICY IF EXISTS "authenticated_can_use_taches" ON taches;

ALTER TABLE taches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "taches_select" ON taches FOR SELECT TO authenticated USING (
  public.is_staff()
  OR (chantier_id IS NOT NULL AND public.client_has_chantier(chantier_id))
);

CREATE POLICY "taches_insert" ON taches FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY "taches_update" ON taches FOR UPDATE TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY "taches_delete" ON taches FOR DELETE TO authenticated
  USING (public.is_staff());

-- ══════════════════════════════════════════════════════════════
-- 6. PLANNING
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all" ON planning;
DROP POLICY IF EXISTS "authenticated_can_use_planning" ON planning;

ALTER TABLE planning ENABLE ROW LEVEL SECURITY;

CREATE POLICY "planning_select" ON planning FOR SELECT TO authenticated USING (
  public.is_staff()
  OR (chantier_id IS NOT NULL AND public.client_has_chantier(chantier_id))
);

CREATE POLICY "planning_insert" ON planning FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY "planning_update" ON planning FOR UPDATE TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY "planning_delete" ON planning FOR DELETE TO authenticated
  USING (public.is_staff());

-- ══════════════════════════════════════════════════════════════
-- 7. RDV (staff only — les clients ne voient pas les rendez-vous
--    internes de l'équipe)
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all" ON rdv;
DROP POLICY IF EXISTS "authenticated_can_use_rdv" ON rdv;

ALTER TABLE rdv ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rdv_all" ON rdv FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- ══════════════════════════════════════════════════════════════
-- 8. COMPTES RENDUS
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all" ON compte_rendus;
DROP POLICY IF EXISTS "authenticated_can_view_cr" ON compte_rendus;
DROP POLICY IF EXISTS "admin_salarie_modify_cr" ON compte_rendus;
DROP POLICY IF EXISTS "admin_delete_cr" ON compte_rendus;

ALTER TABLE compte_rendus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compte_rendus_select" ON compte_rendus FOR SELECT TO authenticated USING (
  public.is_staff()
  OR (chantier_id IS NOT NULL AND public.client_has_chantier(chantier_id))
);

CREATE POLICY "compte_rendus_insert" ON compte_rendus FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY "compte_rendus_update" ON compte_rendus FOR UPDATE TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY "compte_rendus_delete" ON compte_rendus FOR DELETE TO authenticated
  USING (public.is_staff());

-- ══════════════════════════════════════════════════════════════
-- 9. ORDRES DE SERVICE (delete admin only)
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all" ON ordres_service;
DROP POLICY IF EXISTS "authenticated_can_view_os" ON ordres_service;
DROP POLICY IF EXISTS "admin_salarie_modify_os" ON ordres_service;
DROP POLICY IF EXISTS "admin_delete_os" ON ordres_service;

ALTER TABLE ordres_service ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ordres_service_select" ON ordres_service FOR SELECT TO authenticated USING (
  public.is_staff()
  OR (chantier_id IS NOT NULL AND public.client_has_chantier(chantier_id))
);

CREATE POLICY "ordres_service_insert" ON ordres_service FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY "ordres_service_update" ON ordres_service FOR UPDATE TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY "ordres_service_delete" ON ordres_service FOR DELETE TO authenticated
  USING (public.is_admin());

-- ══════════════════════════════════════════════════════════════
-- 10. COMMENTS
--     Staff : tout accès
--     Client : lecture sur objets de ses chantiers, écriture de ses
--              propres commentaires uniquement
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all" ON comments;

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments_select" ON comments FOR SELECT TO authenticated USING (
  public.is_staff()
  OR (chantier_id IS NOT NULL AND public.client_has_chantier(chantier_id))
  OR (os_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM ordres_service o
    WHERE o.id = comments.os_id AND public.client_has_chantier(o.chantier_id)
  ))
  OR (cr_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM compte_rendus cr
    WHERE cr.id = comments.cr_id AND public.client_has_chantier(cr.chantier_id)
  ))
  OR (task_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM taches t
    WHERE t.id = comments.task_id AND public.client_has_chantier(t.chantier_id)
  ))
);

CREATE POLICY "comments_insert" ON comments FOR INSERT TO authenticated
  WITH CHECK (
    lower(trim(author_email)) = public.auth_email()
    AND (
      public.is_staff()
      OR (chantier_id IS NOT NULL AND public.client_has_chantier(chantier_id))
      OR (os_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM ordres_service o
        WHERE o.id = comments.os_id AND public.client_has_chantier(o.chantier_id)
      ))
      OR (cr_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM compte_rendus cr
        WHERE cr.id = comments.cr_id AND public.client_has_chantier(cr.chantier_id)
      ))
      OR (task_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM taches t
        WHERE t.id = comments.task_id AND public.client_has_chantier(t.chantier_id)
      ))
    )
  );

CREATE POLICY "comments_update" ON comments FOR UPDATE TO authenticated
  USING (lower(trim(author_email)) = public.auth_email() OR public.is_staff())
  WITH CHECK (lower(trim(author_email)) = public.auth_email() OR public.is_staff());

CREATE POLICY "comments_delete" ON comments FOR DELETE TO authenticated
  USING (lower(trim(author_email)) = public.auth_email() OR public.is_staff());

-- ══════════════════════════════════════════════════════════════
-- 11. SHARING (staff only — c'est le staff qui gère les accès)
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all" ON sharing;

ALTER TABLE sharing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sharing_all" ON sharing FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- ══════════════════════════════════════════════════════════════
-- 12. TEMPLATES (staff only)
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all" ON templates;

ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "templates_all" ON templates FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- ══════════════════════════════════════════════════════════════
-- 13. ATTACHMENTS
--     Staff : tout accès
--     Client : lecture seule sur attachments liés à ses chantiers
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all" ON attachments;

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attachments_select" ON attachments FOR SELECT TO authenticated USING (
  public.is_staff()
  OR (chantier_id IS NOT NULL AND public.client_has_chantier(chantier_id))
  OR (os_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM ordres_service o
    WHERE o.id = attachments.os_id AND public.client_has_chantier(o.chantier_id)
  ))
  OR (cr_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM compte_rendus cr
    WHERE cr.id = attachments.cr_id AND public.client_has_chantier(cr.chantier_id)
  ))
  OR (task_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM taches t
    WHERE t.id = attachments.task_id AND public.client_has_chantier(t.chantier_id)
  ))
);

CREATE POLICY "attachments_insert" ON attachments FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY "attachments_update" ON attachments FOR UPDATE TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY "attachments_delete" ON attachments FOR DELETE TO authenticated
  USING (public.is_staff());

-- ══════════════════════════════════════════════════════════════
-- 14. SETTINGS (admin only pour l'écriture, staff pour la lecture)
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Allow all" ON settings;

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_select" ON settings FOR SELECT TO authenticated
  USING (public.is_staff());

CREATE POLICY "settings_modify" ON settings FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ══════════════════════════════════════════════════════════════
-- 15. AUTHORIZED_USERS (durcissement du SELECT existant)
--     Avant : tout le monde pouvait lister (fuite d'info collègues)
--     Après : admin voit tout, les autres voient seulement leur profil
-- ══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "authorized_users_select" ON authorized_users;

CREATE POLICY "authorized_users_select" ON authorized_users FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR lower(trim(email)) = public.auth_email()
  );

COMMIT;

-- ══════════════════════════════════════════════════════════════
-- FIN DE LA MIGRATION
-- ══════════════════════════════════════════════════════════════
-- Après exécution, tester immédiatement :
--   1. Connexion avec un user admin → doit voir tous les chantiers
--   2. Connexion avec un user salarié → doit voir tous les chantiers
--   3. Connexion avec un user client → doit voir UNIQUEMENT ses chantiers
--   4. Un user supprimé d'authorized_users → ne voit plus rien
--
-- En cas de problème, exécuter migrations/005_rls_proper_rollback.sql
-- ══════════════════════════════════════════════════════════════
