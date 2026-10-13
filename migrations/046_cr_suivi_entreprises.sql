-- 046 — Comptes rendus : rédaction et suivi des entreprises
--
--   - compte_rendus.alertes : retards, non-conformités, risques notés au CR
--     (partie « Alertes » du PDF, entre la synthèse et les décisions)
-- Idempotent : ré-exécutable sans erreur. À appliquer après 045.

ALTER TABLE public.compte_rendus
  ADD COLUMN IF NOT EXISTS alertes TEXT;
