-- Table pour stocker les références aux fichiers attachés
CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id UUID REFERENCES chantiers(id) ON DELETE CASCADE,
  os_id UUID REFERENCES ordres_service(id) ON DELETE CASCADE,
  cr_id UUID REFERENCES compte_rendus(id) ON DELETE CASCADE,
  task_id UUID REFERENCES taches(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  uploaded_by TEXT,
  uploaded_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index pour recherche rapide par chantier/os/cr/task
CREATE INDEX idx_attachments_chantier ON attachments(chantier_id);
CREATE INDEX idx_attachments_os ON attachments(os_id);
CREATE INDEX idx_attachments_cr ON attachments(cr_id);
CREATE INDEX idx_attachments_task ON attachments(task_id);
