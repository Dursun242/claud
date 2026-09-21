-- ══════════════════════════════════════════════════════════════
-- MIGRATION 026 — Lien devis Qonto ↔ opportunité CRM
-- ══════════════════════════════════════════════════════════════
--
-- Permet de créer une opportunité directement depuis un devis Qonto
-- (onglet Qonto → Devis → « → CRM ») et d'éviter les doublons : l'id
-- du devis Qonto est unique par opportunité.
--
-- IMPACT : deux colonnes nullable, zéro impact sur les lignes existantes.
-- RLS : inchangée (héritée de 025).
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.crm_opportunites
  ADD COLUMN IF NOT EXISTS qonto_quote_id     TEXT,
  ADD COLUMN IF NOT EXISTS qonto_quote_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_opp_qonto_quote
  ON public.crm_opportunites (qonto_quote_id)
  WHERE qonto_quote_id IS NOT NULL;

COMMENT ON COLUMN public.crm_opportunites.qonto_quote_id IS
  'Identifiant du devis Qonto (API v2 /quotes) dont l''opportunité est issue.';
