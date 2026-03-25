-- ═══════════════════════════════════════════
-- AUTHENTICATION & AUTHORIZATION
-- ═══════════════════════════════════════════

-- Users table (linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  prenom TEXT NOT NULL,
  nom TEXT,
  role TEXT DEFAULT 'salarié', -- 'admin' or 'salarié'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enable RLS for app_users
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see all users
CREATE POLICY "users_select" ON app_users FOR SELECT USING (true);

-- Policy: Only admins can insert
CREATE POLICY "users_insert" ON app_users FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM app_users
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- ═══════════════════════════════════════════
-- ADD AUDIT TRAIL TO EXISTING TABLES
-- ═══════════════════════════════════════════

-- Add audit columns to chantiers
ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS created_by_id UUID REFERENCES app_users(id);
ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS created_by_name TEXT;
ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS updated_by_id UUID REFERENCES app_users(id);
ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS updated_by_name TEXT;
ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Add audit columns to ordres_service
ALTER TABLE ordres_service ADD COLUMN IF NOT EXISTS created_by_id UUID REFERENCES app_users(id);
ALTER TABLE ordres_service ADD COLUMN IF NOT EXISTS created_by_name TEXT;
ALTER TABLE ordres_service ADD COLUMN IF NOT EXISTS updated_by_id UUID REFERENCES app_users(id);
ALTER TABLE ordres_service ADD COLUMN IF NOT EXISTS updated_by_name TEXT;
ALTER TABLE ordres_service ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE ordres_service ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Add audit columns to compte_rendus
ALTER TABLE compte_rendus ADD COLUMN IF NOT EXISTS created_by_id UUID REFERENCES app_users(id);
ALTER TABLE compte_rendus ADD COLUMN IF NOT EXISTS created_by_name TEXT;
ALTER TABLE compte_rendus ADD COLUMN IF NOT EXISTS updated_by_id UUID REFERENCES app_users(id);
ALTER TABLE compte_rendus ADD COLUMN IF NOT EXISTS updated_by_name TEXT;
ALTER TABLE compte_rendus ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE compte_rendus ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Add audit columns to taches
ALTER TABLE taches ADD COLUMN IF NOT EXISTS created_by_id UUID REFERENCES app_users(id);
ALTER TABLE taches ADD COLUMN IF NOT EXISTS created_by_name TEXT;
ALTER TABLE taches ADD COLUMN IF NOT EXISTS updated_by_id UUID REFERENCES app_users(id);
ALTER TABLE taches ADD COLUMN IF NOT EXISTS updated_by_name TEXT;
ALTER TABLE taches ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE taches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Add audit columns to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS created_by_id UUID REFERENCES app_users(id);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS created_by_name TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS updated_by_id UUID REFERENCES app_users(id);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS updated_by_name TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
