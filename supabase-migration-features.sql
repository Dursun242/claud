-- ═══════════════════════════════════════════
-- TEMPLATES - Modèles d'OS réutilisables
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL, -- 'os', 'chantier'
  name TEXT NOT NULL,
  description TEXT,
  data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_templates_type ON templates(type);

-- ═══════════════════════════════════════════
-- COMMENTS - Commentaires sur éléments
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id UUID REFERENCES chantiers(id) ON DELETE CASCADE,
  os_id UUID REFERENCES ordres_service(id) ON DELETE CASCADE,
  cr_id UUID REFERENCES compte_rendus(id) ON DELETE CASCADE,
  task_id UUID REFERENCES taches(id) ON DELETE CASCADE,
  author_email TEXT NOT NULL,
  author_name TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_comments_chantier ON comments(chantier_id);
CREATE INDEX idx_comments_os ON comments(os_id);
CREATE INDEX idx_comments_cr ON comments(cr_id);
CREATE INDEX idx_comments_task ON comments(task_id);

-- ═══════════════════════════════════════════
-- SHARING - Partage de chantier avec d'autres
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sharing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id UUID REFERENCES chantiers(id) ON DELETE CASCADE,
  shared_with_email TEXT NOT NULL,
  permission TEXT DEFAULT 'view', -- 'view', 'edit', 'admin'
  shared_by_email TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sharing_chantier ON sharing(chantier_id);
CREATE INDEX idx_sharing_email ON sharing(shared_with_email);
CREATE UNIQUE INDEX idx_sharing_unique ON sharing(chantier_id, shared_with_email);
