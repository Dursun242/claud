-- ══════════════════════════════════════════════════════════════
-- CREATE STORAGE BUCKET — chantier-photos
-- ══════════════════════════════════════════════════════════════
-- Exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- NOTE: Les buckets se créent via le Dashboard Supabase Storage UI
-- Pas via SQL. Mais on peut configurer les RLS policies en SQL.

-- Cependant, créons une fonction helper pour les URLs signées si besoin
CREATE OR REPLACE FUNCTION get_signed_url(storage_path TEXT, expires_in INTEGER DEFAULT 3600)
RETURNS TEXT AS $$
BEGIN
  -- Cette fonction est un placeholder
  -- Utiliser: supabase.storage.from('chantier-photos').createSignedUrl(path, expiresIn)
  RETURN storage_path;
END;
$$ LANGUAGE plpgsql;

-- ══════════════════════════════════════════════════════════════
-- INSTRUCTIONS MANUELLES:
-- ══════════════════════════════════════════════════════════════
-- 1. Va à Supabase Dashboard → Storage
-- 2. Clique "New Bucket"
-- 3. Name: chantier-photos
-- 4. Public: OFF (non-public)
-- 5. Create Bucket
-- ══════════════════════════════════════════════════════════════
