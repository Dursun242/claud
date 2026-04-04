-- ═══════════════════════════════════════════════════════════════════
-- PHASE 1 SÉCURITÉ: Client Access & RLS Implementation
-- ═══════════════════════════════════════════════════════════════════

-- 1. CREATE CLIENT_CHANTIERS TABLE (Explicit relationship)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS client_chantiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES authorized_users(id) ON DELETE CASCADE,
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by_email TEXT,
  UNIQUE(client_id, chantier_id)
);

-- Index pour performances
CREATE INDEX IF NOT EXISTS idx_client_chantiers_client_id ON client_chantiers(client_id);
CREATE INDEX IF NOT EXISTS idx_client_chantiers_chantier_id ON client_chantiers(chantier_id);

-- Enable RLS
ALTER TABLE client_chantiers ENABLE ROW LEVEL SECURITY;

-- RLS: Admins can manage all relationships
CREATE POLICY "client_chantiers_admin" ON client_chantiers
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM authorized_users
    WHERE email = auth.jwt()->>'email'
    AND role = 'admin'
    AND actif = true
  )
);

-- RLS: Clients can see their own relationships
CREATE POLICY "client_chantiers_select" ON client_chantiers
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM authorized_users
    WHERE email = auth.jwt()->>'email'
    AND id = client_chantiers.client_id
    AND actif = true
  )
);

---

-- 2. ENABLE RLS ON CHANTIERS & CREATE POLICIES
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE chantiers ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can do everything on chantiers
CREATE POLICY "chantiers_admin_all" ON chantiers
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM authorized_users
    WHERE email = auth.jwt()->>'email'
    AND role = 'admin'
    AND actif = true
  )
);

-- Policy: Clients can only see their assigned chantiers
CREATE POLICY "chantiers_client_select" ON chantiers
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM client_chantiers cc
    JOIN authorized_users u ON u.id = cc.client_id
    WHERE u.email = auth.jwt()->>'email'
    AND cc.chantier_id = chantiers.id
    AND u.actif = true
  )
  OR
  -- Salarié can see all (for now - adjust as needed)
  EXISTS (
    SELECT 1 FROM authorized_users
    WHERE email = auth.jwt()->>'email'
    AND role = 'salarié'
    AND actif = true
  )
);

---

-- 3. ENABLE RLS ON COMPTE_RENDUS & CREATE POLICIES
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE compte_rendus ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can do everything
CREATE POLICY "compte_rendus_admin_all" ON compte_rendus
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM authorized_users
    WHERE email = auth.jwt()->>'email'
    AND role = 'admin'
    AND actif = true
  )
);

-- Policy: Clients can only see CR for their chantiers
CREATE POLICY "compte_rendus_client_select" ON compte_rendus
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM client_chantiers cc
    JOIN authorized_users u ON u.id = cc.client_id
    WHERE u.email = auth.jwt()->>'email'
    AND cc.chantier_id = compte_rendus.chantier_id
    AND u.actif = true
  )
  OR
  -- Salarié can see all CR
  EXISTS (
    SELECT 1 FROM authorized_users
    WHERE email = auth.jwt()->>'email'
    AND role = 'salarié'
    AND actif = true
  )
);

---

-- 4. ENABLE RLS ON ORDRES_SERVICE & CREATE POLICIES
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE ordres_service ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can do everything
CREATE POLICY "ordres_service_admin_all" ON ordres_service
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM authorized_users
    WHERE email = auth.jwt()->>'email'
    AND role = 'admin'
    AND actif = true
  )
);

-- Policy: Clients can see OS for their chantiers
CREATE POLICY "ordres_service_client_select" ON ordres_service
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM client_chantiers cc
    JOIN authorized_users u ON u.id = cc.client_id
    WHERE u.email = auth.jwt()->>'email'
    AND cc.chantier_id = ordres_service.chantier_id
    AND u.actif = true
  )
  OR
  -- Salarié can see all OS
  EXISTS (
    SELECT 1 FROM authorized_users
    WHERE email = auth.jwt()->>'email'
    AND role = 'salarié'
    AND actif = true
  )
);

---

-- 5. RESTRICT authorized_users VISIBILITY
-- ═══════════════════════════════════════════════════════════════════

-- Drop overly permissive policy if it exists
DROP POLICY IF EXISTS "users_select" ON authorized_users;

-- New policy: Users can only see active users (not other's details)
CREATE POLICY "authorized_users_select_limited" ON authorized_users
FOR SELECT USING (
  -- Only see yourself or if you're admin (can see all)
  id = auth.uuid()
  OR
  EXISTS (
    SELECT 1 FROM authorized_users au
    WHERE au.email = auth.jwt()->>'email'
    AND au.role = 'admin'
    AND au.actif = true
  )
);

---

-- 6. ENABLE RLS ON CONTACTS & CREATE POLICIES
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can do everything
CREATE POLICY "contacts_admin_all" ON contacts
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM authorized_users
    WHERE email = auth.jwt()->>'email'
    AND role = 'admin'
    AND actif = true
  )
);

-- Policy: Salarié and clients can see all contacts (for now)
-- This can be refined later if needed
CREATE POLICY "contacts_select_authenticated" ON contacts
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM authorized_users
    WHERE email = auth.jwt()->>'email'
    AND actif = true
  )
);

---

-- 7. ENABLE RLS ON TACHES & CREATE POLICIES
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE taches ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can do everything
CREATE POLICY "taches_admin_all" ON taches
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM authorized_users
    WHERE email = auth.jwt()->>'email'
    AND role = 'admin'
    AND actif = true
  )
);

-- Policy: Users can see tasks for their chantiers
CREATE POLICY "taches_client_select" ON taches
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM client_chantiers cc
    JOIN authorized_users u ON u.id = cc.client_id
    WHERE u.email = auth.jwt()->>'email'
    AND cc.chantier_id = taches.chantier_id
    AND u.actif = true
  )
  OR
  -- Salarié can see all tasks
  EXISTS (
    SELECT 1 FROM authorized_users
    WHERE email = auth.jwt()->>'email'
    AND role = 'salarié'
    AND actif = true
  )
);

---

-- NOTE: After running this migration:
-- 1. Migrate existing client data from "client" field to client_chantiers table
-- 2. Run data migration script (separate)
-- 3. Update frontend code to use new client_chantiers relationship
-- 4. Test RLS policies thoroughly before production
