-- 038 — Documents des entreprises : suspension des relances automatiques
--
-- Par entreprise : relances suspendues sans limite, ou jusqu'à une date
-- (reprise automatique ce jour-là). La suspension de toutes les relances
-- est gardée dans la table settings (clé conformite_relances_pause), sans
-- migration. Écriture par le serveur (/api/conformite, équipe).
-- À appliquer après 037. Idempotent.

BEGIN;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS relances_suspendues BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS relances_reprise_le DATE;

COMMIT;
