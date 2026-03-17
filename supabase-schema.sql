-- ══════════════════════════════════════════════════════════════
-- ID MAÎTRISE — SCHÉMA SUPABASE COMPLET
-- SARL ID MAITRISE — 9 Rue Henry Genestal, 76600 Le Havre
-- ══════════════════════════════════════════════════════════════

-- 1. CHANTIERS
CREATE TABLE IF NOT EXISTS chantiers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nom TEXT NOT NULL,
  client TEXT,
  adresse TEXT,
  phase TEXT DEFAULT 'Hors d''air' CHECK (phase IN ('Hors d''air', 'Technique', 'Finitions')),
  statut TEXT DEFAULT 'Planifié' CHECK (statut IN ('Planifié', 'En cours', 'En attente', 'Terminé')),
  budget NUMERIC DEFAULT 0,
  depenses NUMERIC DEFAULT 0,
  date_debut DATE,
  date_fin DATE,
  lots TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. CONTACTS (Artisans, Clients, Fournisseurs)
CREATE TABLE IF NOT EXISTS contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nom TEXT NOT NULL,
  type TEXT DEFAULT 'Artisan' CHECK (type IN ('Artisan', 'Client', 'Fournisseur')),
  specialite TEXT,
  tel TEXT,
  email TEXT,
  adresse TEXT,
  siret TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. CONTACT ↔ CHANTIER (relation many-to-many)
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
  priorite TEXT DEFAULT 'En cours' CHECK (priorite IN ('Urgent', 'En cours', 'En attente')),
  statut TEXT DEFAULT 'Planifié' CHECK (statut IN ('Planifié', 'En cours', 'Terminé')),
  echeance DATE,
  lot TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. PLANNING (tâches Gantt)
CREATE TABLE IF NOT EXISTS planning (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chantier_id UUID REFERENCES chantiers(id) ON DELETE CASCADE,
  lot TEXT,
  tache TEXT NOT NULL,
  debut DATE,
  fin DATE,
  avancement INTEGER DEFAULT 0 CHECK (avancement >= 0 AND avancement <= 100),
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
  -- Parties
  client_nom TEXT,
  client_adresse TEXT,
  artisan_nom TEXT,
  artisan_specialite TEXT,
  artisan_tel TEXT,
  artisan_email TEXT,
  artisan_siret TEXT,
  -- Dates
  date_emission DATE DEFAULT CURRENT_DATE,
  date_intervention DATE,
  date_fin_prevue DATE,
  -- Prestations (stockées en JSONB)
  -- Format: [{ "description": "...", "unite": "m²", "quantite": 10, "prix_unitaire": 45.00, "tva_taux": 20 }]
  prestations JSONB DEFAULT '[]',
  -- Montants calculés
  montant_ht NUMERIC DEFAULT 0,
  montant_tva NUMERIC DEFAULT 0,
  montant_ttc NUMERIC DEFAULT 0,
  -- Statut
  statut TEXT DEFAULT 'Brouillon' CHECK (statut IN ('Brouillon', 'Émis', 'Signé', 'En cours', 'Terminé', 'Annulé')),
  -- Observations
  observations TEXT,
  conditions TEXT DEFAULT 'Paiement à 30 jours à compter de la réception de la facture.',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════
-- INDEXES pour performances
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
-- FONCTION auto-update updated_at
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_chantiers_updated BEFORE UPDATE ON chantiers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_contacts_updated BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_taches_updated BEFORE UPDATE ON taches FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_cr_updated BEFORE UPDATE ON compte_rendus FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_os_updated BEFORE UPDATE ON ordres_service FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (désactivé pour l'instant — à activer avec auth)
-- ══════════════════════════════════════════════════════════════
ALTER TABLE chantiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_chantiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE taches ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning ENABLE ROW LEVEL SECURITY;
ALTER TABLE rdv ENABLE ROW LEVEL SECURITY;
ALTER TABLE compte_rendus ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordres_service ENABLE ROW LEVEL SECURITY;

-- Policies permissives (accès total avec clé anon pour commencer)
-- Tu pourras restreindre plus tard avec l'auth Supabase
CREATE POLICY "Allow all" ON chantiers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON contacts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON contact_chantiers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON taches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON planning FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON rdv FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON compte_rendus FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON ordres_service FOR ALL USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════
-- DONNÉES D'EXEMPLE (optionnel — décommente pour pré-remplir)
-- ══════════════════════════════════════════════════════════════

/*
INSERT INTO chantiers (nom, client, adresse, phase, statut, budget, depenses, date_debut, date_fin, lots) VALUES
  ('Résidence Les Voiles', 'SCI Maritime', '12 Quai de Southampton, Le Havre', 'Technique', 'En cours', 450000, 287000, '2025-09-01', '2026-06-30', ARRAY['Gros œuvre','Électricité','Plomberie','Menuiserie']),
  ('Bureaux Port 2000', 'HAROPA', 'Zone industrielle Port 2000', 'Hors d''air', 'En cours', 820000, 195000, '2025-11-15', '2026-12-31', ARRAY['Structure métallique','Bardage','Électricité','CVC']),
  ('Villa Sainte-Adresse', 'M. Durand', '8 Rue Émile Zola, Sainte-Adresse', 'Finitions', 'En cours', 280000, 241000, '2025-03-01', '2026-04-15', ARRAY['Peinture','Revêtements sols','Menuiserie int.']),
  ('Maison Friboulet', 'Famille Friboulet', 'Riville', 'Hors d''air', 'En cours', 320000, 78000, '2025-12-01', '2026-09-30', ARRAY['Gros œuvre','Charpente','Menuiseries ext.','Électricité','Plomberie']),
  ('Garage Lucas', 'M. Lucas', 'Oudalle', 'Technique', 'En cours', 85000, 32000, '2026-01-15', '2026-05-30', ARRAY['Maçonnerie','Charpente','Couverture']);

INSERT INTO contacts (nom, type, specialite, tel, email) VALUES
  ('Lefèvre Électricité', 'Artisan', 'Électricité CFO/CFA', '06 12 34 56 78', 'lefevre.elec@mail.fr'),
  ('Costa Plomberie', 'Artisan', 'Plomberie / CVC', '06 23 45 67 89', 'costa.plomb@mail.fr'),
  ('Normandie Peinture', 'Artisan', 'Peinture / Ravalement', '06 34 56 78 90', 'norm.peinture@mail.fr'),
  ('HAROPA', 'Client', 'Maîtrise d''ouvrage', '02 35 xx xx xx', 'projets@haropa.fr'),
  ('SCI Maritime', 'Client', 'Promotion immobilière', '02 35 xx xx xx', 'contact@sci-maritime.fr'),
  ('Point P Le Havre', 'Fournisseur', 'Matériaux gros œuvre', '02 35 xx xx xx', 'lehavre@pointp.fr'),
  ('Rexel Normandie', 'Fournisseur', 'Matériel électrique', '02 35 xx xx xx', 'normandie@rexel.fr'),
  ('Famille Friboulet', 'Client', 'Particulier', '06 78 90 12 34', 'friboulet@mail.fr'),
  ('Eurofins Laboratoire', 'Fournisseur', 'Analyses / Contrôle', '02 35 xx xx xx', 'contact@eurofins.fr');
*/
