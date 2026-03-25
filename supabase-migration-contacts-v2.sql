-- ══════════════════════════════════════════════════════════════
-- MIGRATION : Ajout des champs étendus sur la table contacts
-- À exécuter UNE SEULE FOIS dans Supabase → SQL Editor
-- ══════════════════════════════════════════════════════════════

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS societe TEXT,
  ADD COLUMN IF NOT EXISTS fonction TEXT,
  ADD COLUMN IF NOT EXISTS tel_fixe TEXT,
  ADD COLUMN IF NOT EXISTS code_postal TEXT,
  ADD COLUMN IF NOT EXISTS ville TEXT,
  ADD COLUMN IF NOT EXISTS site_web TEXT,
  ADD COLUMN IF NOT EXISTS tva_intra TEXT,
  ADD COLUMN IF NOT EXISTS assurance_decennale TEXT,
  ADD COLUMN IF NOT EXISTS assurance_validite DATE,
  ADD COLUMN IF NOT EXISTS iban TEXT,
  ADD COLUMN IF NOT EXISTS qualifications TEXT,
  ADD COLUMN IF NOT EXISTS note INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actif BOOLEAN DEFAULT true;
