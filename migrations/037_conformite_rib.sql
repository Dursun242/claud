-- 037 — Documents des entreprises : ajout du RIB
--
-- Nouveau type de document « rib » (relevé d'identité bancaire), avec
-- l'IBAN et le BIC lus sur le document. L'IBAN est comparé à celui de la
-- fiche contact : un RIB qui change est signalé (risque de faux RIB) et
-- n'est reporté sur la fiche qu'après vérification par l'équipe.
-- À appliquer après 036. Idempotent.

BEGIN;

ALTER TABLE public.contact_documents DROP CONSTRAINT IF EXISTS contact_documents_kind_check;
ALTER TABLE public.contact_documents ADD CONSTRAINT contact_documents_kind_check
  CHECK (kind IN ('kbis', 'decennale', 'fiscale', 'urssaf', 'rib'));

ALTER TABLE public.contact_documents
  ADD COLUMN IF NOT EXISTS iban TEXT,
  ADD COLUMN IF NOT EXISTS bic  TEXT;

COMMIT;
