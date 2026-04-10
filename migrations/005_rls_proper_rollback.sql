-- ══════════════════════════════════════════════════════════════
-- ROLLBACK MIGRATION 005 — revenir à l'état "Allow all"
-- ══════════════════════════════════════════════════════════════
--
-- ⚠️ CE ROLLBACK RESTAURE L'INSÉCURITÉ D'ORIGINE.
--    À utiliser UNIQUEMENT si la migration 005 casse la prod et
--    qu'il faut récupérer l'accès en urgence.
--
-- Une fois exécuté, la base redevient ouverte à toute personne
-- ayant la clé anon — il faut replanifier un nouveau plan RLS.
--
-- ══════════════════════════════════════════════════════════════

BEGIN;

-- ─── Drop toutes les nouvelles policies ─────────────────────────
DROP POLICY IF EXISTS "chantiers_select" ON chantiers;
DROP POLICY IF EXISTS "chantiers_insert" ON chantiers;
DROP POLICY IF EXISTS "chantiers_update" ON chantiers;
DROP POLICY IF EXISTS "chantiers_delete" ON chantiers;

DROP POLICY IF EXISTS "contacts_all" ON contacts;
DROP POLICY IF EXISTS "contact_chantiers_all" ON contact_chantiers;

DROP POLICY IF EXISTS "taches_select" ON taches;
DROP POLICY IF EXISTS "taches_insert" ON taches;
DROP POLICY IF EXISTS "taches_update" ON taches;
DROP POLICY IF EXISTS "taches_delete" ON taches;

DROP POLICY IF EXISTS "planning_select" ON planning;
DROP POLICY IF EXISTS "planning_insert" ON planning;
DROP POLICY IF EXISTS "planning_update" ON planning;
DROP POLICY IF EXISTS "planning_delete" ON planning;

DROP POLICY IF EXISTS "rdv_all" ON rdv;

DROP POLICY IF EXISTS "compte_rendus_select" ON compte_rendus;
DROP POLICY IF EXISTS "compte_rendus_insert" ON compte_rendus;
DROP POLICY IF EXISTS "compte_rendus_update" ON compte_rendus;
DROP POLICY IF EXISTS "compte_rendus_delete" ON compte_rendus;

DROP POLICY IF EXISTS "ordres_service_select" ON ordres_service;
DROP POLICY IF EXISTS "ordres_service_insert" ON ordres_service;
DROP POLICY IF EXISTS "ordres_service_update" ON ordres_service;
DROP POLICY IF EXISTS "ordres_service_delete" ON ordres_service;

DROP POLICY IF EXISTS "comments_select" ON comments;
DROP POLICY IF EXISTS "comments_insert" ON comments;
DROP POLICY IF EXISTS "comments_update" ON comments;
DROP POLICY IF EXISTS "comments_delete" ON comments;

DROP POLICY IF EXISTS "sharing_all" ON sharing;
DROP POLICY IF EXISTS "templates_all" ON templates;

DROP POLICY IF EXISTS "attachments_select" ON attachments;
DROP POLICY IF EXISTS "attachments_insert" ON attachments;
DROP POLICY IF EXISTS "attachments_update" ON attachments;
DROP POLICY IF EXISTS "attachments_delete" ON attachments;

DROP POLICY IF EXISTS "settings_select" ON settings;
DROP POLICY IF EXISTS "settings_modify" ON settings;

DROP POLICY IF EXISTS "authorized_users_select" ON authorized_users;

-- ─── Drop les fonctions helper ──────────────────────────────────
DROP FUNCTION IF EXISTS public.client_has_chantier(UUID);
DROP FUNCTION IF EXISTS public.client_prenom();
DROP FUNCTION IF EXISTS public.is_admin();
DROP FUNCTION IF EXISTS public.is_staff();
DROP FUNCTION IF EXISTS public.auth_email();

-- ─── Recréer les policies "Allow all" d'origine ─────────────────
CREATE POLICY "Allow all" ON chantiers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON contacts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON contact_chantiers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON taches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON planning FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON rdv FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON compte_rendus FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON ordres_service FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON comments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON sharing FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON attachments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON settings FOR ALL USING (true) WITH CHECK (true);

-- Restaurer la policy permissive sur authorized_users
CREATE POLICY "authorized_users_select" ON authorized_users FOR SELECT USING (true);

COMMIT;

-- ⚠️ La base est de nouveau OUVERTE. À remplacer rapidement.
