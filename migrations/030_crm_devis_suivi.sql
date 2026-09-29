-- 030 — Devis : suivi des ouvertures du mail et des consultations en ligne
--
-- Chaque mail de devis contient une image invisible (1×1) propre au devis :
-- quand le logiciel de messagerie du client l'affiche, une « ouverture » est
-- enregistrée. La page de signature en ligne enregistre aussi les
-- « consultations » (page et PDF). Visible uniquement par l'équipe (staff).
--
-- Écriture par le serveur uniquement (service role) ; lecture staff (RLS).
-- Idempotent : ré-exécutable sans erreur.

BEGIN;

ALTER TABLE public.crm_devis
  ADD COLUMN IF NOT EXISTS track_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS crm_devis_track_token_key
  ON public.crm_devis (track_token) WHERE track_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.crm_devis_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id    UUID NOT NULL REFERENCES public.crm_devis(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('ouverture', 'consultation', 'pdf')),
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_devis_events_devis_idx
  ON public.crm_devis_events (devis_id, created_at DESC);

ALTER TABLE public.crm_devis_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_devis_events_select" ON public.crm_devis_events;
CREATE POLICY "crm_devis_events_select" ON public.crm_devis_events
  FOR SELECT TO authenticated
  USING (public.is_staff());

COMMIT;
