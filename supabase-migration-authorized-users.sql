-- ═══════════════════════════════════════════
-- TABLE DES UTILISATEURS AUTORISÉS
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS authorized_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  prenom TEXT NOT NULL,
  nom TEXT,
  role TEXT DEFAULT 'salarié', -- 'admin' ou 'salarié'
  actif BOOLEAN DEFAULT true,
  added_by_email TEXT, -- Qui a donné l'accès
  added_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index pour recherche rapide par email
CREATE INDEX IF NOT EXISTS idx_authorized_users_email ON authorized_users(email);
CREATE INDEX IF NOT EXISTS idx_authorized_users_actif ON authorized_users(actif);

-- Enable RLS
ALTER TABLE authorized_users ENABLE ROW LEVEL SECURITY;

-- Tous les utilisateurs authentifiés peuvent voir la liste
CREATE POLICY "authorized_users_select" ON authorized_users FOR SELECT USING (true);

-- Seulement l'admin peut modifier
CREATE POLICY "authorized_users_admin_only" ON authorized_users
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM authorized_users
    WHERE email = current_user AND role = 'admin' AND actif = true
  )
);

-- ═══════════════════════════════════════════
-- AJOUTER LES CHAMPS DE TRAÇABILITÉ AUX TABLES
-- ═══════════════════════════════════════════

-- Chantiers
ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS created_by_email TEXT;
ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS created_by_prenom TEXT;
ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS updated_by_email TEXT;
ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS updated_by_prenom TEXT;
ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Ordres de Service
ALTER TABLE ordres_service ADD COLUMN IF NOT EXISTS created_by_email TEXT;
ALTER TABLE ordres_service ADD COLUMN IF NOT EXISTS created_by_prenom TEXT;
ALTER TABLE ordres_service ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE ordres_service ADD COLUMN IF NOT EXISTS updated_by_email TEXT;
ALTER TABLE ordres_service ADD COLUMN IF NOT EXISTS updated_by_prenom TEXT;
ALTER TABLE ordres_service ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Comptes Rendus
ALTER TABLE compte_rendus ADD COLUMN IF NOT EXISTS created_by_email TEXT;
ALTER TABLE compte_rendus ADD COLUMN IF NOT EXISTS created_by_prenom TEXT;
ALTER TABLE compte_rendus ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE compte_rendus ADD COLUMN IF NOT EXISTS updated_by_email TEXT;
ALTER TABLE compte_rendus ADD COLUMN IF NOT EXISTS updated_by_prenom TEXT;
ALTER TABLE compte_rendus ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Tâches
ALTER TABLE taches ADD COLUMN IF NOT EXISTS created_by_email TEXT;
ALTER TABLE taches ADD COLUMN IF NOT EXISTS created_by_prenom TEXT;
ALTER TABLE taches ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE taches ADD COLUMN IF NOT EXISTS updated_by_email TEXT;
ALTER TABLE taches ADD COLUMN IF NOT EXISTS updated_by_prenom TEXT;
ALTER TABLE taches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS created_by_email TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS created_by_prenom TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS updated_by_email TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS updated_by_prenom TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
