-- Migration: PV de réception — plusieurs signataires MOA et Entreprise
--
-- CONTEXTE
--
-- `signataire_moa_email` et `signataire_entreprise_email` sont des colonnes
-- TEXT à valeur unique. Le front (PVNewForm) permet désormais de
-- sélectionner plusieurs entreprises, et jusqu'à 3 maîtres d'ouvrage
-- (co-propriétaires). On ajoute deux colonnes JSONB pour stocker la liste
-- complète, tout en conservant les colonnes TEXT existantes (premier email
-- de chaque liste) pour la rétrocompatibilité de l'affichage/export.
--
-- NOTE : `signataire_entreprise_emails` corrige un bug — le code de la
-- route /api/pv-reception/create écrivait déjà cette colonne (pour
-- supporter plusieurs entreprises) sans qu'elle n'ait jamais été créée en
-- base, ce qui faisait échouer l'insertion de tout PV multi-entreprises.

ALTER TABLE proces_verbaux_reception
  ADD COLUMN IF NOT EXISTS signataire_entreprise_emails JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS signataire_moa_emails JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN proces_verbaux_reception.signataire_entreprise_emails IS
  'Liste des emails entreprise (JSON array). signataire_entreprise_email garde le premier pour rétrocompat.';
COMMENT ON COLUMN proces_verbaux_reception.signataire_moa_emails IS
  'Liste des emails maître d''ouvrage, max 3 (JSON array). signataire_moa_email garde le premier pour rétrocompat.';
