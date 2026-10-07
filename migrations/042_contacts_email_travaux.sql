-- 042 — Contacts : second email « travaux »
--
-- Une entreprise a souvent deux adresses : l'administratif (devis, factures,
-- documents de conformité) et le chantier (conducteur de travaux, chef
-- d'équipe). La colonne email reste l'email administratif ; email_travaux
-- reçoit les comptes rendus et les convocations (si vide : email).
-- Idempotent : ré-exécutable sans erreur. À appliquer après 041.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS email_travaux TEXT;
