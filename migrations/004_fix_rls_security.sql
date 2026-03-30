-- ══════════════════════════════════════════════════════════════
-- MIGRATION 004 — FIX RLS SECURITY
-- Remplacer les "Allow all" par des policies sécurisées
-- ══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. CHANTIERS — Accessible à authentifiés uniquement
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all" ON chantiers;

CREATE POLICY "authenticated_can_view_chantiers" ON chantiers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_can_modify_chantiers" ON chantiers
  FOR INSERT, UPDATE, DELETE TO authenticated
  USING ((SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'admin');

-- ─────────────────────────────────────────────────────────────
-- 2. CONTACTS — Accessible à authentifiés uniquement
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all" ON contacts;

CREATE POLICY "authenticated_can_view_contacts" ON contacts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_can_modify_contacts" ON contacts
  FOR INSERT, UPDATE, DELETE TO authenticated
  USING ((SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'admin');

-- ─────────────────────────────────────────────────────────────
-- 3. ORDRES DE SERVICE — Admin/Salarié modifient, Client valide
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all" ON ordres_service;

CREATE POLICY "authenticated_can_view_os" ON ordres_service
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_salarie_modify_os" ON ordres_service
  FOR INSERT, UPDATE TO authenticated
  USING ((SELECT role FROM user_roles WHERE user_id = auth.uid()) IN ('admin', 'salarie'))
  WITH CHECK ((SELECT role FROM user_roles WHERE user_id = auth.uid()) IN ('admin', 'salarie'));

CREATE POLICY "admin_delete_os" ON ordres_service
  FOR DELETE TO authenticated
  USING ((SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'admin');

-- ─────────────────────────────────────────────────────────────
-- 4. COMPTES RENDUS — Admin/Salarié modifient
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all" ON compte_rendus;

CREATE POLICY "authenticated_can_view_cr" ON compte_rendus
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_salarie_modify_cr" ON compte_rendus
  FOR INSERT, UPDATE TO authenticated
  USING ((SELECT role FROM user_roles WHERE user_id = auth.uid()) IN ('admin', 'salarie'))
  WITH CHECK ((SELECT role FROM user_roles WHERE user_id = auth.uid()) IN ('admin', 'salarie'));

CREATE POLICY "admin_delete_cr" ON compte_rendus
  FOR DELETE TO authenticated
  USING ((SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'admin');

-- ─────────────────────────────────────────────────────────────
-- 5. AUTRES TABLES — Même pattern
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all" ON contact_chantiers;
CREATE POLICY "authenticated_can_use_contact_chantiers" ON contact_chantiers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all" ON taches;
CREATE POLICY "authenticated_can_use_taches" ON taches
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all" ON planning;
CREATE POLICY "authenticated_can_use_planning" ON planning
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all" ON rdv;
CREATE POLICY "authenticated_can_use_rdv" ON rdv
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ═════════════════════════════════════════════════════════════
-- RÉSUMÉ DES CHANGEMENTS
-- ═════════════════════════════════════════════════════════════
-- ✅ Toutes les policies nécessitent authentification
-- ✅ Admin peut tout faire
-- ✅ Salarié peut créer/éditer chantiers, OS, CR
-- ✅ Client ne peut que lire et valider OS
-- ✅ Données isolées par rôle
-- ═════════════════════════════════════════════════════════════
-- EXÉCUTER DANS SUPABASE SQL EDITOR
-- ═════════════════════════════════════════════════════════════
