-- ══════════════════════════════════════════════════════════════
-- MIGRATION 024 — Intervenants structurés sur les comptes rendus
-- ══════════════════════════════════════════════════════════════
--
-- CONTEXTE
--
-- Le champ "Participants" des comptes rendus de chantier était un texte
-- libre, saisi à la main (ou dicté à l'assistant IA). Cette colonne
-- permet de sélectionner les intervenants par case à cocher, à partir
-- des contacts déjà rattachés au chantier (cf. table contact_chantiers),
-- et de les imprimer sous forme de tableau (N°, Nom, Entreprise, Email,
-- Téléphone) en première page du PDF.
--
-- Le champ "participants" (texte libre) est conservé pour les notes
-- ou personnes hors contacts (ex: "et 2 riverains").
--
-- IMPACT
--
-- - Colonne JSONB avec DEFAULT '[]' : zéro impact sur les CR existants
--   (le PDF retombe sur le rendu texte libre si le tableau est vide).
-- - Pas de RLS à modifier (la table hérite déjà des policies
--   appliquées par 005_rls_proper.sql).
-- ══════════════════════════════════════════════════════════════

ALTER TABLE compte_rendus
  ADD COLUMN IF NOT EXISTS intervenants JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN compte_rendus.intervenants IS
  'Intervenants sélectionnés par case à cocher (contacts du chantier). '
  'Tableau de { nom, email, societe, tel, siret }. Le champ "participants" '
  '(texte libre) reste disponible pour les notes complémentaires.';
