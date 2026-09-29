-- ⚠ NE PAS RÉEXÉCUTER SUR UNE BASE EXISTANTE ⚠
-- Script historique : il (re)crée des policies permissives (USING (true) ou
-- accès à tout le bucket). Les policies Postgres s'additionnent (OR) : le
-- relancer annulerait les restrictions des migrations 005, 018 et 021
-- (y compris sur la table settings qui contient le jeton Qonto).
-- Ordre à jour : migrations/APPLY_ORDER.md.

-- ══════════════════════════════════════════════════════════════
-- MIGRATION : Table settings (clé-valeur, partagée entre appareils)
-- À exécuter dans Supabase → SQL Editor
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON settings;
CREATE POLICY "Allow all" ON settings FOR ALL USING (true) WITH CHECK (true);
