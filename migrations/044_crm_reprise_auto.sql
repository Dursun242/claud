-- 044 — CRM : relance automatique des affaires en attente
--
-- À la date de reprise d'une affaire « En attente » (migration 043), le
-- client reçoit un mail de reprise de contact avec des choix de réponse
-- (le projet redémarre, toujours en pause : dans 3 ou 6 mois, abandonné,
-- autre), via la page publique /reprise/<jeton> (route /api/cron/reprise,
-- tous les matins en semaine).
--   - reprise_auto       : mail automatique à la date de reprise (oui par défaut)
--   - reprise_token      : jeton de la page de réponse (64 hex)
--   - reprise_envoyee_le : date du dernier mail de reprise (un seul mail par date de reprise)
-- Idempotent : ré-exécutable sans erreur. À appliquer après 043.

BEGIN;

ALTER TABLE public.crm_opportunites
  ADD COLUMN IF NOT EXISTS reprise_auto BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reprise_token TEXT,
  ADD COLUMN IF NOT EXISTS reprise_envoyee_le DATE;

CREATE UNIQUE INDEX IF NOT EXISTS crm_opportunites_reprise_token_key
  ON public.crm_opportunites (reprise_token) WHERE reprise_token IS NOT NULL;

COMMIT;
