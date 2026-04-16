-- Lier les Procès-Verbaux aux Ordres de Service

-- 1. Ajouter champ os_id à proces_verbaux_reception
ALTER TABLE proces_verbaux_reception
  ADD COLUMN os_id uuid REFERENCES ordres_service(id) ON DELETE SET NULL,
  ADD COLUMN decision_immediat boolean DEFAULT false,
  ADD COLUMN reserves_acceptation text;

-- 2. Ajouter champ pv_id à ordres_service pour tracker que l'OS a un PV
ALTER TABLE ordres_service
  ADD COLUMN pv_id uuid REFERENCES proces_verbaux_reception(id) ON DELETE SET NULL;

-- 3. Index pour recherche rapide
CREATE INDEX idx_proces_verbaux_os_id ON proces_verbaux_reception(os_id);
CREATE INDEX idx_ordres_service_pv_id ON ordres_service(pv_id);

-- 4. Unique constraint: un OS ne peut avoir qu'un seul PV
ALTER TABLE ordres_service
  ADD CONSTRAINT unique_pv_per_os UNIQUE(pv_id);
