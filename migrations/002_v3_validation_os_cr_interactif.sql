-- ══════════════════════════════════════════════════════════════
-- MIGRATION V3.0 — PRODUCTION
-- Validation Client OS + CR Interactif + Photos
-- ══════════════════════════════════════════════════════════════
-- ⚠️ EXÉCUTER DANS SUPABASE SQL EDITOR
-- ══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. ORDRES DE SERVICE — Ajouter Validation Client
-- ─────────────────────────────────────────────────────────────
ALTER TABLE ordres_service
  ADD COLUMN IF NOT EXISTS validation_client BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS date_validation_client TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS client_id UUID NULL;

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_os_validation_status
  ON ordres_service(statut, validation_client);
CREATE INDEX IF NOT EXISTS idx_os_client_id
  ON ordres_service(client_id);

-- ─────────────────────────────────────────────────────────────
-- 2. COMPTES RENDUS — Ajouter Interactivité + Photos
-- ─────────────────────────────────────────────────────────────
ALTER TABLE compte_rendus
  ADD COLUMN IF NOT EXISTS semaine INTEGER NULL,
  ADD COLUMN IF NOT EXISTS annee INTEGER DEFAULT DATE_PART('year', CURRENT_DATE),
  ADD COLUMN IF NOT EXISTS photos TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_by_user UUID NULL,
  ADD COLUMN IF NOT EXISTS last_edited_by_user UUID NULL,
  ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ NULL;

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_cr_semaine
  ON compte_rendus(chantier_id, semaine, annee);

-- ─────────────────────────────────────────────────────────────
-- 3. TABLE — Validations Ordres de Service
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS os_validations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  os_id UUID NOT NULL REFERENCES ordres_service(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  date_validation TIMESTAMPTZ DEFAULT now(),
  UNIQUE(os_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_os_validations_os ON os_validations(os_id);

-- ─────────────────────────────────────────────────────────────
-- 4. TABLE — Commentaires & Demandes Clients (CR)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cr_commentaires (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cr_id UUID NOT NULL REFERENCES compte_rendus(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_role TEXT NOT NULL,
  contenu TEXT NOT NULL,
  type TEXT DEFAULT 'commentaire',
  status TEXT DEFAULT 'ouvert',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cr_commentaires ON cr_commentaires(cr_id);
CREATE INDEX IF NOT EXISTS idx_cr_commentaires_user ON cr_commentaires(user_id);

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION update_cr_commentaires_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cr_commentaires_updated ON cr_commentaires;
CREATE TRIGGER trg_cr_commentaires_updated
  BEFORE UPDATE ON cr_commentaires
  FOR EACH ROW EXECUTE FUNCTION update_cr_commentaires_timestamp();

-- ─────────────────────────────────────────────────────────────
-- 5. TABLE — Photos Chantier (avec compression)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chantier_photos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  cr_id UUID NULL REFERENCES compte_rendus(id) ON DELETE SET NULL,
  url_storage TEXT NOT NULL,
  description TEXT,
  largeur INTEGER,
  hauteur INTEGER,
  taille_originale INTEGER,
  taille_optimisee INTEGER,
  date_photo DATE DEFAULT CURRENT_DATE,
  uploaded_by_user UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chantier_photos ON chantier_photos(chantier_id);
CREATE INDEX IF NOT EXISTS idx_chantier_photos_cr ON chantier_photos(cr_id);

-- ─────────────────────────────────────────────────────────────
-- 6. ENABLE RLS sur les nouvelles tables
-- ─────────────────────────────────────────────────────────────
ALTER TABLE os_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cr_commentaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE chantier_photos ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- 7. RLS POLICIES — Permissive pour démarrer
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "Allow all os_validations" ON os_validations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all cr_commentaires" ON cr_commentaires FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all chantier_photos" ON chantier_photos FOR ALL USING (true) WITH CHECK (true);

-- ═════════════════════════════════════════════════════════════
-- ✅ MIGRATION COMPLÈTE
-- ═════════════════════════════════════════════════════════════
-- Copier le contenu entier
-- Aller à Supabase → SQL Editor
-- Coller et cliquer "Run"
-- Vérifier dans Table Editor:
--   ✅ ordres_service: validation_client, date_validation_client, client_id
--   ✅ compte_rendus: semaine, annee, photos, created_by_user
--   ✅ os_validations (table)
--   ✅ cr_commentaires (table)
--   ✅ chantier_photos (table)
-- ═════════════════════════════════════════════════════════════
