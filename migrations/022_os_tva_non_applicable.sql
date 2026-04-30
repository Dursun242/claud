-- ══════════════════════════════════════════════════════════════
-- MIGRATION 022 — TVA non applicable sur Ordre de Service
-- ══════════════════════════════════════════════════════════════
--
-- CONTEXTE
--
-- Certains artisans (auto-entrepreneurs en franchise de base de TVA,
-- art. 293 B du CGI) ne facturent pas la TVA. Avant cette migration,
-- l'utilisateur devait basculer manuellement le taux à 0 % pour
-- chaque ligne de prestation. Cette colonne ajoute un flag au niveau
-- de l'OS qui :
--   1. force toutes les lignes à 0 % côté UI ;
--   2. déclenche l'impression de la mention légale obligatoire
--      « TVA non applicable, art. 293 B du CGI » sur le PDF.
--
-- IMPACT
--
-- - Colonne booléenne avec DEFAULT false : zéro impact sur les OS
--   existants.
-- - Pas de RLS à modifier (la table hérite déjà des policies
--   appliquées par 005_rls_proper.sql).
-- ══════════════════════════════════════════════════════════════

ALTER TABLE ordres_service
  ADD COLUMN IF NOT EXISTS tva_non_applicable BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN ordres_service.tva_non_applicable IS
  'Auto-entrepreneur en franchise de base de TVA (art. 293 B du CGI). '
  'Si true, toutes les lignes ont TVA 0 % et la mention légale est imprimée sur le PDF.';
