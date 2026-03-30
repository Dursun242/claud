-- ══════════════════════════════════════════════════════════════
-- MIGRATION V3.0 — Validation Client OS + CR Interactif
-- ══════════════════════════════════════════════════════════════
-- Exécuter dans Supabase SQL Editor
-- ⚠️ NON-DESTRUCTIF — Uniquement ALTER TABLE + CREATE
-- ══════════════════════════════════════════════════════════════

-- ─── 1. ORDRES DE SERVICE — Validation Client ───
ALTER TABLE ordres_service
  ADD COLUMN IF NOT EXISTS validation_client BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS date_validation_client TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS client_id UUID NULL;

-- Table pour tracer les validations signées
CREATE TABLE IF NOT EXISTS os_validations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  os_id UUID NOT NULL REFERENCES ordres_service(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  date_validation TIMESTAMPTZ DEFAULT now(),
  ip_address TEXT NULL,
  UNIQUE(os_id, client_id)
);

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_os_validation_status
  ON ordres_service(statut, validation_client);
CREATE INDEX IF NOT EXISTS idx_os_validations_os
  ON os_validations(os_id);
CREATE INDEX IF NOT EXISTS idx_os_client_id
  ON ordres_service(client_id);

-- ─── 2. COMPTES RENDUS — Interactivité ───
ALTER TABLE compte_rendus
  ADD COLUMN IF NOT EXISTS semaine INTEGER NULL,
  ADD COLUMN IF NOT EXISTS annee INTEGER DEFAULT DATE_PART('year', CURRENT_DATE),
  ADD COLUMN IF NOT EXISTS photos TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_by_user UUID NULL,
  ADD COLUMN IF NOT EXISTS last_edited_by_user UUID NULL,
  ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ NULL;

-- Table pour commentaires & demandes spécifiques du client
CREATE TABLE IF NOT EXISTS cr_commentaires (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cr_id UUID NOT NULL REFERENCES compte_rendus(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_role TEXT NOT NULL,  -- 'admin', 'salarie', 'client'
  contenu TEXT NOT NULL,
  type TEXT DEFAULT 'commentaire',  -- 'commentaire' ou 'demande_specifique'
  status TEXT DEFAULT 'ouvert',  -- 'ouvert' ou 'resolu'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_cr_semaine
  ON compte_rendus(chantier_id, semaine, annee);
CREATE INDEX IF NOT EXISTS idx_cr_commentaires
  ON cr_commentaires(cr_id);
CREATE INDEX IF NOT EXISTS idx_cr_commentaires_user
  ON cr_commentaires(user_id);

-- ─── 3. PHOTOS CHANTIER — Galerie par chantier ───
CREATE TABLE IF NOT EXISTS chantier_photos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  cr_id UUID NULL REFERENCES compte_rendus(id) ON DELETE SET NULL,
  url_storage TEXT NOT NULL,  -- Path dans Supabase Storage
  description TEXT,
  largeur INTEGER,  -- Width pour affichage
  hauteur INTEGER,  -- Height pour affichage
  taille_originale INTEGER,  -- Taille originale en bytes
  taille_optimisee INTEGER,  -- Taille après compression
  date_photo DATE DEFAULT CURRENT_DATE,
  uploaded_by_user UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_chantier_photos
  ON chantier_photos(chantier_id);
CREATE INDEX IF NOT EXISTS idx_chantier_photos_cr
  ON chantier_photos(cr_id);

-- ─── 4. RLS POLICIES — Sécurité par rôle ───

-- ⚠️ IMPORTANT: Vérifier que auth.jwt() contient le field 'role'
-- Sinon adapter selon ta structure auth

-- OS Validation — Client peut valider ses OS
CREATE POLICY IF NOT EXISTS "client_validate_os"
  ON ordres_service
  FOR UPDATE
  TO authenticated
  USING (
    -- Client peut valider les OS de ses chantiers
    auth.uid() = client_id OR
    (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    auth.uid() = client_id OR
    (SELECT role FROM user_roles WHERE user_id = auth.uid()) = 'admin'
  );

-- CR — Admin et Salarié peuvent éditer
CREATE POLICY IF NOT EXISTS "admin_salarie_edit_cr"
  ON compte_rendus
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM user_roles WHERE user_id = auth.uid()) IN ('admin', 'salarie')
  );

-- Commentaires CR — Tous peuvent commenter
CREATE POLICY IF NOT EXISTS "anyone_comment_cr"
  ON cr_commentaires
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Photos — Admin et Salarié peuvent uploader
CREATE POLICY IF NOT EXISTS "upload_chantier_photos"
  ON chantier_photos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM user_roles WHERE user_id = auth.uid()) IN ('admin', 'salarie')
  );

-- ─── 5. TRIGGER — Timestamp updated_at ───
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS trigger_cr_updated_at
  BEFORE UPDATE ON compte_rendus
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER IF NOT EXISTS trigger_cr_commentaires_updated_at
  BEFORE UPDATE ON cr_commentaires
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

-- ─── 6. STORAGE BUCKET — Photos ───
-- ⚠️ À créer dans Supabase Dashboard → Storage
-- Créer bucket: "chantier-photos"
-- Public: NON
-- Pour upload: Utiliser signed URL ou RLS policy

-- ══════════════════════════════════════════════════════════════
-- EXÉCUTION COMPLÈTE
-- ══════════════════════════════════════════════════════════════
-- Copier-coller ce fichier entier dans Supabase SQL Editor
-- Cliquer "Run" ou "Exécuter"
-- Vérifier dans Table Editor que les colonnes/tables existent
-- ══════════════════════════════════════════════════════════════
