-- 041 — Devis : relance avec choix de réponse
--
-- Le mail de relance d'un devis propose au client une liste de raisons
-- (budget, autre proposition, projet reporté…, autre). Il clique, confirme
-- sur la page /reponse/<jeton> et sa réponse est enregistrée sur le devis.
--
-- crm_devis_events reçoit deux nouveaux types :
--   'relance' : mail de relance envoyé (detail : { to })
--   'reponse' : réponse du client (detail : { raison, commentaire })
-- Écriture serveur (service role) ; lecture staff (RLS de la migration 030).
-- Idempotent : ré-exécutable sans erreur. À appliquer après 030.

BEGIN;

ALTER TABLE public.crm_devis_events
  ADD COLUMN IF NOT EXISTS detail JSONB;

ALTER TABLE public.crm_devis_events
  DROP CONSTRAINT IF EXISTS crm_devis_events_kind_check;
ALTER TABLE public.crm_devis_events
  ADD CONSTRAINT crm_devis_events_kind_check
  CHECK (kind IN ('ouverture', 'consultation', 'pdf', 'relance', 'reponse'));

COMMIT;
