-- 047 — Chantiers : ordre choisi à la main
--
-- La liste des chantiers se range par glisser-déposer ; l'ordre est
-- partagé par toute l'équipe (lib/chantierOrder.js). Un chantier sans
-- ordre (nouveau) s'affiche en tête.
-- Idempotent : ré-exécutable sans erreur. À appliquer après 046.

ALTER TABLE public.chantiers
  ADD COLUMN IF NOT EXISTS ordre INTEGER;
