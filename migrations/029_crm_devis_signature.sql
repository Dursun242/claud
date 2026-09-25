-- 029 — Devis : signature électronique intégrée (sans service tiers)
--
-- Le client reçoit un lien sécurisé (/signer/<jeton>) : il consulte le PDF
-- Qonto du devis, saisit son nom, signe au doigt / à la souris et coche
-- « Bon pour accord ». La signature est apposée sur le PDF et les preuves
-- (date, IP, navigateur, empreinte SHA-256 du PDF d'origine) sont gardées.
--
-- Les PDF (original + signé) sont stockés dans le bucket privé
-- `attachments`, dossier devis-signature/<id devis>/ (accès service role).
--
-- Idempotent : ré-exécutable sans erreur.

ALTER TABLE public.crm_devis
  ADD COLUMN IF NOT EXISTS sign_token          TEXT,
  ADD COLUMN IF NOT EXISTS sign_email          TEXT,
  ADD COLUMN IF NOT EXISTS sign_requested_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sign_pdf_path       TEXT,
  ADD COLUMN IF NOT EXISTS sign_pdf_sha256     TEXT,
  ADD COLUMN IF NOT EXISTS statut_signature    TEXT,
  ADD COLUMN IF NOT EXISTS signed_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signed_name         TEXT,
  ADD COLUMN IF NOT EXISTS signed_ip           TEXT,
  ADD COLUMN IF NOT EXISTS signed_user_agent   TEXT,
  ADD COLUMN IF NOT EXISTS signed_pdf_path     TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS crm_devis_sign_token_key
  ON public.crm_devis (sign_token) WHERE sign_token IS NOT NULL;
