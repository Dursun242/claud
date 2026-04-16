-- Migration: Créer table procès-verbaux de réception

CREATE TABLE proces_verbaux_reception (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  numero TEXT NOT NULL, -- PV-2024-001
  titre TEXT NOT NULL,
  description TEXT,
  date_creation TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  date_reception TIMESTAMP WITH TIME ZONE,

  -- Signatures Odoo
  odoo_sign_id INTEGER UNIQUE,
  odoo_sign_url TEXT,
  statut_signature TEXT DEFAULT 'Brouillon', -- Brouillon, Envoyé, Signé, Refusé, Expiré

  -- Décision finale
  statut_reception TEXT DEFAULT 'En attente', -- En attente, Accepté, Accepté avec réserve, Refusé
  motif_refus TEXT,

  -- Signataires
  signataire_moe_email TEXT, -- Maître d'œuvre
  signataire_moa_email TEXT, -- Maître d'ouvrage
  signataire_entreprise_email TEXT, -- Entreprise

  -- Dates de signature
  date_signature_moe TIMESTAMP WITH TIME ZONE,
  date_signature_moa TIMESTAMP WITH TIME ZONE,
  date_signature_entreprise TIMESTAMP WITH TIME ZONE,

  -- Documents
  pdf_path TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index
CREATE INDEX idx_pv_chantier ON proces_verbaux_reception(chantier_id);
CREATE INDEX idx_pv_numero ON proces_verbaux_reception(numero);
CREATE INDEX idx_pv_statut ON proces_verbaux_reception(statut_reception);
CREATE INDEX idx_pv_signature ON proces_verbaux_reception(statut_signature);
