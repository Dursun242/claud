-- 029 — Devis : signature électronique (Odoo Sign)
--
-- Le PDF Qonto du devis peut être envoyé au client pour signature
-- électronique via Odoo Sign (même module que les OS / PV). On garde
-- l'identifiant de la demande Odoo et son statut pour le suivi.
--
-- Idempotent : ré-exécutable sans erreur.

ALTER TABLE public.crm_devis
  ADD COLUMN IF NOT EXISTS odoo_sign_id     INTEGER,
  ADD COLUMN IF NOT EXISTS odoo_sign_url    TEXT,
  ADD COLUMN IF NOT EXISTS statut_signature TEXT;
