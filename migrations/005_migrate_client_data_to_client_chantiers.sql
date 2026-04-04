-- ═══════════════════════════════════════════════════════════════════
-- DATA MIGRATION: Migrate existing client data to client_chantiers
-- ═══════════════════════════════════════════════════════════════════

-- IMPORTANT: Run this AFTER migration 004_phase1_security_client_access_rls.sql

-- This script maps existing client names (from chantiers.client field)
-- to authorized_users IDs and populates client_chantiers table

-- Step 1: Create temporary mapping between client names and user IDs
WITH client_mapping AS (
  SELECT DISTINCT
    au.id as user_id,
    au.email,
    au.prenom,
    TRIM(LOWER(CONCAT(au.prenom, ' ', COALESCE(au.nom, '')))) as full_name_lower
  FROM authorized_users au
  WHERE au.role = 'client'
    AND au.actif = true
),
chantier_clients AS (
  SELECT DISTINCT
    c.id as chantier_id,
    TRIM(LOWER(c.client)) as client_name_lower
  FROM chantiers c
  WHERE c.client IS NOT NULL
    AND TRIM(c.client) != ''
)
-- Step 2: Insert into client_chantiers matching by name similarity
INSERT INTO client_chantiers (client_id, chantier_id, created_by_email, created_at)
SELECT DISTINCT
  cm.user_id,
  cc.chantier_id,
  'migration@system.local',
  NOW()
FROM chantier_clients cc
LEFT JOIN client_mapping cm ON (
  -- Match if client name contains user's prenom
  cc.client_name_lower LIKE CONCAT('%', LOWER(cm.prenom), '%')
  OR
  -- Or if user's full name matches client name
  cc.client_name_lower = cm.full_name_lower
)
WHERE cm.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM client_chantiers
    WHERE client_chantiers.client_id = cm.user_id
      AND client_chantiers.chantier_id = cc.chantier_id
  )
ON CONFLICT (client_id, chantier_id) DO NOTHING;

-- Step 3: Verify the migration
SELECT
  COUNT(*) as total_mappings,
  COUNT(DISTINCT client_id) as unique_clients,
  COUNT(DISTINCT chantier_id) as unique_chantiers
FROM client_chantiers;

-- ═══════════════════════════════════════════════════════════════════
-- MANUAL VERIFICATION NEEDED:
-- ═══════════════════════════════════════════════════════════════════
-- 1. Check if all clients were properly mapped
-- 2. Run this query to see unmapped chantiers:
--    SELECT c.id, c.nom, c.client FROM chantiers c
--    WHERE NOT EXISTS (
--      SELECT 1 FROM client_chantiers cc
--      WHERE cc.chantier_id = c.id
--    );
-- 3. Manually add missing mappings in client_chantiers
-- 4. Test RLS policies before going to production
