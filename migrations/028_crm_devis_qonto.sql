-- 028 — Devis : lien avec le devis créé dans Qonto
--
-- Un devis rédigé dans l'application peut être enregistré dans Qonto
-- (route /api/devis/qonto). On garde ici l'identifiant du devis Qonto
-- pour mettre à jour le même devis au lieu d'en créer un second.
--
-- Idempotent : ré-exécutable sans erreur.

ALTER TABLE public.crm_devis
  ADD COLUMN IF NOT EXISTS qonto_quote_id  TEXT,
  ADD COLUMN IF NOT EXISTS qonto_client_id TEXT,
  ADD COLUMN IF NOT EXISTS qonto_url       TEXT,
  ADD COLUMN IF NOT EXISTS qonto_synced_at TIMESTAMPTZ,
  -- empreinte du contenu envoyé (détecte un devis modifié depuis)
  ADD COLUMN IF NOT EXISTS qonto_hash      TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS crm_devis_qonto_quote_id_key
  ON public.crm_devis (qonto_quote_id) WHERE qonto_quote_id IS NOT NULL;
