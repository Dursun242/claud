-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 1: REFONTE COMPLÈTE - STRUCTURE ADMIN/CLIENT/SALARIÉ + PLANS + PHOTOS
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Ajouter client_id à chantiers si n'existe pas déjà
ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES auth.users(id);
ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS salarie_ids UUID[] DEFAULT '{}';

-- 2. Ajouter colonne role à users_metadata (ou créer une table séparée si nécessaire)
-- Note: En Supabase, le rôle est généralement stocké dans raw_user_meta_data ou dans une table séparée
-- On va créer une table user_roles pour plus de clarté

CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'client', 'salarie')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Table des plans
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  file_path TEXT NOT NULL, -- Chemin dans Supabase Storage (plans/)
  type TEXT DEFAULT 'plan', -- plan, devis, schéma, photo-avant, etc.
  file_size INT,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  uploaded_by_id UUID NOT NULL REFERENCES auth.users(id),
  created_by_prenom TEXT,
  updated_by_prenom TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Table des reportages photos
CREATE TABLE IF NOT EXISTS photo_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  description TEXT,
  cover_image_id UUID, -- ID de la première photo pour la couverture
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by_id UUID NOT NULL REFERENCES auth.users(id),
  created_by_prenom TEXT,
  updated_by_prenom TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Table des photos individuelles
CREATE TABLE IF NOT EXISTS photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES photo_reports(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL, -- Chemin dans Supabase Storage (photos/)
  caption TEXT,
  position INT DEFAULT 0,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  uploaded_by_id UUID NOT NULL REFERENCES auth.users(id),
  created_by_prenom TEXT
);

-- 6. Index pour performance
CREATE INDEX IF NOT EXISTS idx_chantiers_client_id ON chantiers(client_id);
CREATE INDEX IF NOT EXISTS idx_plans_chantier_id ON plans(chantier_id);
CREATE INDEX IF NOT EXISTS idx_photo_reports_chantier_id ON photo_reports(chantier_id);
CREATE INDEX IF NOT EXISTS idx_photos_report_id ON photos(report_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable RLS on new tables
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

-- USER_ROLES Policies
CREATE POLICY "Admins can view all user roles"
  ON user_roles FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM user_roles WHERE role = 'admin'
    )
  );

CREATE POLICY "Users can view their own role"
  ON user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage user roles"
  ON user_roles FOR ALL
  USING (
    auth.uid() IN (
      SELECT user_id FROM user_roles WHERE role = 'admin'
    )
  );

-- PLANS Policies
CREATE POLICY "Admins can view all plans"
  ON plans FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM user_roles WHERE role = 'admin'
    )
  );

CREATE POLICY "Clients can view plans of their chantiers"
  ON plans FOR SELECT
  USING (
    auth.uid() IN (
      SELECT client_id FROM chantiers WHERE id = plans.chantier_id
    )
  );

CREATE POLICY "Salaries can view plans of their chantiers"
  ON plans FOR SELECT
  USING (
    auth.uid() IN (
      SELECT UNNEST(salarie_ids) FROM chantiers WHERE id = plans.chantier_id
    )
  );

CREATE POLICY "Admins can create plans"
  ON plans FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM user_roles WHERE role = 'admin'
    )
  );

CREATE POLICY "Users can create plans for their chantiers"
  ON plans FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT client_id FROM chantiers WHERE id = plans.chantier_id
    )
    OR auth.uid() IN (
      SELECT user_id FROM user_roles WHERE role = 'admin'
    )
  );

-- PHOTO_REPORTS Policies
CREATE POLICY "Admins can view all photo reports"
  ON photo_reports FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM user_roles WHERE role = 'admin'
    )
  );

CREATE POLICY "Clients can view photo reports of their chantiers"
  ON photo_reports FOR SELECT
  USING (
    auth.uid() IN (
      SELECT client_id FROM chantiers WHERE id = photo_reports.chantier_id
    )
  );

CREATE POLICY "Salaries can view photo reports of their chantiers"
  ON photo_reports FOR SELECT
  USING (
    auth.uid() IN (
      SELECT UNNEST(salarie_ids) FROM chantiers WHERE id = photo_reports.chantier_id
    )
  );

CREATE POLICY "Users can create photo reports for their chantiers"
  ON photo_reports FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT client_id FROM chantiers WHERE id = photo_reports.chantier_id
    )
    OR auth.uid() IN (
      SELECT UNNEST(salarie_ids) FROM chantiers WHERE id = photo_reports.chantier_id
    )
    OR auth.uid() IN (
      SELECT user_id FROM user_roles WHERE role = 'admin'
    )
  );

-- PHOTOS Policies
CREATE POLICY "Admins can view all photos"
  ON photos FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM user_roles WHERE role = 'admin'
    )
  );

CREATE POLICY "Users can view photos of reports they have access to"
  ON photos FOR SELECT
  USING (
    auth.uid() IN (
      SELECT ur.user_id FROM user_roles ur WHERE ur.role = 'admin'
    )
    OR auth.uid() IN (
      SELECT pr.created_by_id FROM photo_reports pr WHERE pr.id = photos.report_id
    )
    OR auth.uid() IN (
      SELECT DISTINCT c.client_id FROM chantiers c
      JOIN photo_reports pr ON pr.chantier_id = c.id
      WHERE pr.id = photos.report_id
    )
    OR auth.uid() IN (
      SELECT DISTINCT UNNEST(c.salarie_ids) FROM chantiers c
      JOIN photo_reports pr ON pr.chantier_id = c.id
      WHERE pr.id = photos.report_id
    )
  );

CREATE POLICY "Users can upload photos to their reports"
  ON photos FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT pr.created_by_id FROM photo_reports pr WHERE pr.id = photos.report_id
    )
    OR auth.uid() IN (
      SELECT user_id FROM user_roles WHERE role = 'admin'
    )
  );

-- Update existing CHANTIERS RLS to include access for salaries
DROP POLICY IF EXISTS "Authenticated users can view their own chantiers" ON chantiers;

CREATE POLICY "Users can view chantiers they have access to"
  ON chantiers FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM user_roles WHERE role = 'admin'
    )
    OR auth.uid() = client_id
    OR auth.uid() IN (SELECT UNNEST(salarie_ids))
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- FUNCTIONS UTILITAIRES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_user_role(user_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM user_roles WHERE user_id = user_id LIMIT 1;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM user_roles WHERE user_id = user_id), FALSE);
$$ LANGUAGE SQL STABLE;
