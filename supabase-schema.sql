-- ══════════════════════════════════════════════════════════════
-- ID MAÎTRISE — SCHÉMA SUPABASE (version safe - re-exécutable)
-- ══════════════════════════════════════════════════════════════

-- 1. CHANTIERS
CREATE TABLE IF NOT EXISTS chantiers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nom TEXT NOT NULL,
  client TEXT,
  adresse TEXT,
  phase TEXT DEFAULT 'Hors d''air',
  statut TEXT DEFAULT 'Planifié',
  budget NUMERIC DEFAULT 0,
  depenses NUMERIC DEFAULT 0,
  date_debut DATE,
  date_fin DATE,
  lots TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. CONTACTS
CREATE TABLE IF NOT EXISTS contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nom TEXT NOT NULL,
  type TEXT DEFAULT 'Artisan',
  specialite TEXT,
  tel TEXT,
  email TEXT,
  adresse TEXT,
  siret TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. CONTACT ↔ CHANTIER
CREATE TABLE IF NOT EXISTS contact_chantiers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  chantier_id UUID REFERENCES chantiers(id) ON DELETE CASCADE,
  UNIQUE(contact_id, chantier_id)
);

-- 4. TÂCHES
CREATE TABLE IF NOT EXISTS taches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chantier_id UUID REFERENCES chantiers(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  priorite TEXT DEFAULT 'En cours',
  statut TEXT DEFAULT 'Planifié',
  echeance DATE,
  lot TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. PLANNING
CREATE TABLE IF NOT EXISTS planning (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chantier_id UUID REFERENCES chantiers(id) ON DELETE CASCADE,
  lot TEXT,
  tache TEXT NOT NULL,
  debut DATE,
  fin DATE,
  avancement INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. RENDEZ-VOUS
CREATE TABLE IF NOT EXISTS rdv (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chantier_id UUID REFERENCES chantiers(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  date DATE,
  heure TEXT,
  lieu TEXT,
  participants TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. COMPTES RENDUS
CREATE TABLE IF NOT EXISTS compte_rendus (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chantier_id UUID REFERENCES chantiers(id) ON DELETE CASCADE,
  date DATE,
  numero INTEGER,
  resume TEXT,
  participants TEXT,
  decisions TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. ORDRES DE SERVICE
CREATE TABLE IF NOT EXISTS ordres_service (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero TEXT NOT NULL,
  chantier_id UUID REFERENCES chantiers(id) ON DELETE CASCADE,
  client_nom TEXT,
  client_adresse TEXT,
  artisan_nom TEXT,
  artisan_specialite TEXT,
  artisan_tel TEXT,
  artisan_email TEXT,
  artisan_siret TEXT,
  date_emission DATE DEFAULT CURRENT_DATE,
  date_intervention DATE,
  date_fin_prevue DATE,
  prestations JSONB DEFAULT '[]',
  montant_ht NUMERIC DEFAULT 0,
  montant_tva NUMERIC DEFAULT 0,
  montant_ttc NUMERIC DEFAULT 0,
  statut TEXT DEFAULT 'Brouillon',
  observations TEXT,
  conditions TEXT DEFAULT 'Paiement à 30 jours à compter de la réception de la facture.',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════
-- INDEXES
-- ══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_chantiers_statut ON chantiers(statut);
CREATE INDEX IF NOT EXISTS idx_taches_chantier ON taches(chantier_id);
CREATE INDEX IF NOT EXISTS idx_taches_statut ON taches(statut);
CREATE INDEX IF NOT EXISTS idx_planning_chantier ON planning(chantier_id);
CREATE INDEX IF NOT EXISTS idx_rdv_date ON rdv(date);
CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(type);
CREATE INDEX IF NOT EXISTS idx_os_chantier ON ordres_service(chantier_id);
CREATE INDEX IF NOT EXISTS idx_os_statut ON ordres_service(statut);
CREATE INDEX IF NOT EXISTS idx_cr_chantier ON compte_rendus(chantier_id);

-- ══════════════════════════════════════════════════════════════
-- FONCTION updated_at (DROP + CREATE pour éviter les conflits)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- DROP triggers existants puis recréer
DROP TRIGGER IF EXISTS trg_chantiers_updated ON chantiers;
DROP TRIGGER IF EXISTS trg_contacts_updated ON contacts;
DROP TRIGGER IF EXISTS trg_taches_updated ON taches;
DROP TRIGGER IF EXISTS trg_cr_updated ON compte_rendus;
DROP TRIGGER IF EXISTS trg_os_updated ON ordres_service;

CREATE TRIGGER trg_chantiers_updated BEFORE UPDATE ON chantiers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_contacts_updated BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_taches_updated BEFORE UPDATE ON taches FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_cr_updated BEFORE UPDATE ON compte_rendus FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_os_updated BEFORE UPDATE ON ordres_service FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (DROP existantes + recréer)
-- ══════════════════════════════════════════════════════════════
ALTER TABLE chantiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_chantiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE taches ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning ENABLE ROW LEVEL SECURITY;
ALTER TABLE rdv ENABLE ROW LEVEL SECURITY;
ALTER TABLE compte_rendus ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordres_service ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist, then recreate
DROP POLICY IF EXISTS "Allow all" ON chantiers;
DROP POLICY IF EXISTS "Allow all" ON contacts;
DROP POLICY IF EXISTS "Allow all" ON contact_chantiers;
DROP POLICY IF EXISTS "Allow all" ON taches;
DROP POLICY IF EXISTS "Allow all" ON planning;
DROP POLICY IF EXISTS "Allow all" ON rdv;
DROP POLICY IF EXISTS "Allow all" ON compte_rendus;
DROP POLICY IF EXISTS "Allow all" ON ordres_service;

CREATE POLICY "Allow all" ON chantiers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON contacts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON contact_chantiers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON taches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON planning FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON rdv FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON compte_rendus FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON ordres_service FOR ALL USING (true) WITH CHECK (true);
