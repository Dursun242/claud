-- ═══════════════════════════════════════════
-- FIX RLS POLICIES FOR AUTHORIZED_USERS
-- ═══════════════════════════════════════════
-- This script fixes the broken RLS policies on the authorized_users table
-- Run this on your Supabase instance to enable proper admin management

-- Drop existing policies that use incorrect current_user logic
DROP POLICY IF EXISTS "authorized_users_admin_only" ON authorized_users;

-- Create corrected policies that properly use auth.jwt()
-- INSERT policy: Admins can add new users
CREATE POLICY "authorized_users_insert" ON authorized_users
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM authorized_users
    WHERE email = auth.jwt()->>'email' AND role = 'admin' AND actif = true
  )
);

-- UPDATE policy: Admins can update users
CREATE POLICY "authorized_users_update" ON authorized_users
FOR UPDATE WITH CHECK (
  EXISTS (
    SELECT 1 FROM authorized_users
    WHERE email = auth.jwt()->>'email' AND role = 'admin' AND actif = true
  )
);

-- DELETE policy: Admins can delete users
CREATE POLICY "authorized_users_delete" ON authorized_users
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM authorized_users
    WHERE email = auth.jwt()->>'email' AND role = 'admin' AND actif = true
  )
);
