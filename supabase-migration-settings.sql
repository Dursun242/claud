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
