-- 040 — Chiffrage estimatif (DPGF) par chantier + lot des ordres de service
--
-- Un chiffrage par chantier : lots → postes (désignation, quantité, unité,
-- prix unitaire HT), aléas et TVA. Créé par l'IA depuis une description,
-- importé d'un texte / tableau, ou saisi à la main. La « réalité » est donnée
-- par les ordres de service, rattachés à un lot (nouvelle colonne
-- ordres_service.lot) : comparaison estimé / engagé lot par lot.
--
-- Réservé à l'équipe (is_staff) : le maître d'ouvrage n'y a pas accès.
-- À appliquer après 039. Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS public.chantier_chiffrages (
  chantier_id  UUID PRIMARY KEY REFERENCES public.chantiers(id) ON DELETE CASCADE,
  description  TEXT,
  surface_m2   NUMERIC,
  lots         JSONB NOT NULL DEFAULT '[]'::jsonb,
  aleas_pct    NUMERIC NOT NULL DEFAULT 0,
  tva_pct      NUMERIC NOT NULL DEFAULT 20,
  source       TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   TEXT
);

ALTER TABLE public.chantier_chiffrages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chantier_chiffrages_staff" ON public.chantier_chiffrages;
CREATE POLICY "chantier_chiffrages_staff" ON public.chantier_chiffrages
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

ALTER TABLE public.ordres_service ADD COLUMN IF NOT EXISTS lot TEXT;

COMMIT;

-- Prise en compte immédiate par l'API Supabase
NOTIFY pgrst, 'reload schema';
