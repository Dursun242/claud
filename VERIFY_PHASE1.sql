-- ═══════════════════════════════════════════════════════════════════
-- PHASE 1 VERIFICATION SCRIPT
-- Exécuter ce script dans Supabase SQL Editor pour vérifier l'installation
-- ═══════════════════════════════════════════════════════════════════

-- 1. VERIFY TABLE EXISTS
-- ═══════════════════════════════════════════════════════════════════
SELECT 'CLIENT_CHANTIERS TABLE' as check_name,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_name = 'client_chantiers'
       ) THEN '✅ EXISTS' ELSE '❌ MISSING' END as status;

-- 2. VERIFY TABLE COLUMNS
-- ═══════════════════════════════════════════════════════════════════
SELECT 'CLIENT_CHANTIERS COLUMNS' as check_name,
       STRING_AGG(column_name, ', ' ORDER BY ordinal_position) as columns
FROM information_schema.columns
WHERE table_name = 'client_chantiers'
GROUP BY table_name;

-- 3. CHECK RLS IS ENABLED ON TABLES
-- ═══════════════════════════════════════════════════════════════════
SELECT
  schemaname,
  tablename,
  CASE WHEN rowsecurity THEN '✅ ENABLED' ELSE '❌ DISABLED' END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('chantiers', 'compte_rendus', 'ordres_service', 'contacts', 'taches', 'client_chantiers', 'attachments')
ORDER BY tablename;

-- 4. COUNT RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════
SELECT
  tablename,
  COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- 5. LIST ALL RLS POLICIES BY TABLE
-- ═══════════════════════════════════════════════════════════════════
SELECT
  schemaname,
  tablename,
  policyname,
  qual as policy_condition
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 6. CHECK DATA IN CLIENT_CHANTIERS
-- ═══════════════════════════════════════════════════════════════════
SELECT 'CLIENT_CHANTIERS DATA' as check_name,
       COUNT(*) as total_mappings
FROM client_chantiers;

-- 7. VERIFY AUTHORIZED_USERS TABLE
-- ═══════════════════════════════════════════════════════════════════
SELECT 'AUTHORIZED_USERS' as check_name,
       COUNT(*) as total_users,
       COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_count,
       COUNT(CASE WHEN role = 'client' THEN 1 END) as client_count,
       COUNT(CASE WHEN actif = true THEN 1 END) as active_count
FROM authorized_users;

-- 8. SHOW ADMIN USERS
-- ═══════════════════════════════════════════════════════════════════
SELECT email, prenom, nom, role, actif
FROM authorized_users
WHERE role = 'admin'
ORDER BY created_at DESC;

-- 9. SHOW CLIENT USERS
-- ═══════════════════════════════════════════════════════════════════
SELECT email, prenom, nom, role, actif
FROM authorized_users
WHERE role = 'client'
ORDER BY created_at DESC;

-- 10. SHOW CHANTIERS WITH THEIR CLIENT MAPPINGS
-- ═══════════════════════════════════════════════════════════════════
SELECT
  c.id,
  c.nom as chantier_nom,
  c.client as old_client_field,
  COUNT(cc.id) as mapped_clients,
  STRING_AGG(au.email, ', ') as client_emails
FROM chantiers c
LEFT JOIN client_chantiers cc ON cc.chantier_id = c.id
LEFT JOIN authorized_users au ON au.id = cc.client_id
GROUP BY c.id, c.nom, c.client
ORDER BY c.nom;

-- 11. FIND UNMAPPED CHANTIERS
-- ═══════════════════════════════════════════════════════════════════
SELECT 'UNMAPPED CHANTIERS' as check_name,
       COUNT(*) as count
FROM chantiers c
WHERE NOT EXISTS (
  SELECT 1 FROM client_chantiers cc
  WHERE cc.chantier_id = c.id
);

SELECT c.id, c.nom, c.client
FROM chantiers c
WHERE NOT EXISTS (
  SELECT 1 FROM client_chantiers cc
  WHERE cc.chantier_id = c.id
)
ORDER BY c.nom;

-- 12. CHECK ATTACHMENTS TABLE
-- ═══════════════════════════════════════════════════════════════════
SELECT 'ATTACHMENTS TABLE' as check_name,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_name = 'attachments'
       ) THEN '✅ EXISTS' ELSE '❌ MISSING' END as status;

-- 13. OVERALL PHASE 1 STATUS
-- ═══════════════════════════════════════════════════════════════════
SELECT
  '📋 PHASE 1 STATUS' as check_name,
  CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'client_chantiers')
      AND (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'chantiers') > 0
      AND (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'compte_rendus') > 0
    THEN '✅ COMPLETE - Ready to deploy'
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'client_chantiers')
    THEN '⚠️ PARTIAL - Table exists, check RLS policies'
    ELSE '❌ INCOMPLETE - Migrations not run'
  END as status;
