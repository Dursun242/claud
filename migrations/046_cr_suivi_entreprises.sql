-- 046 — Comptes rendus : rédaction et suivi des entreprises
--
--   - compte_rendus.alertes : retards, non-conformités, risques notés au CR
--     (partie « Alertes » du PDF, entre la synthèse et les décisions)
--   - cr_liens : lien de réponse sans compte d'une entreprise sur un
--     chantier (/actions/<jeton>, 64 hex, valable 60 jours, prolongé à
--     chaque envoi). Lu et écrit uniquement par le serveur (service role) :
--     RLS activée, lecture réservée à l'équipe.
--   - taches.reponse_entreprise : dernière réponse de l'entreprise à
--     l'action ({ type: fait | delai | desaccord, date, commentaire, photo,
--     le, entreprise, nom }) ; pré-remplit le compte rendu suivant
--   - taches.rappel_echeance : échéance pour laquelle le rappel J-2 est
--     parti (une échéance reportée est rappelée à nouveau)
--   - taches.mise_en_demeure_le : date du courrier de mise en demeure
--     préparé pour l'action
-- Idempotent : ré-exécutable sans erreur. À appliquer après 045.

BEGIN;

ALTER TABLE public.compte_rendus
  ADD COLUMN IF NOT EXISTS alertes TEXT;

ALTER TABLE public.taches
  ADD COLUMN IF NOT EXISTS reponse_entreprise JSONB,
  ADD COLUMN IF NOT EXISTS rappel_echeance DATE,
  ADD COLUMN IF NOT EXISTS mise_en_demeure_le DATE;

CREATE TABLE IF NOT EXISTS public.cr_liens (
  token           TEXT PRIMARY KEY,
  chantier_id     UUID NOT NULL REFERENCES public.chantiers(id) ON DELETE CASCADE,
  cr_id           UUID REFERENCES public.compte_rendus(id) ON DELETE SET NULL,
  entreprise      TEXT NOT NULL,
  nom             TEXT,
  email           TEXT,
  expire_le       DATE NOT NULL,
  derniere_visite TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cr_liens_chantier_idx ON public.cr_liens (chantier_id, expire_le);

ALTER TABLE public.cr_liens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cr_liens_select" ON public.cr_liens;
CREATE POLICY "cr_liens_select" ON public.cr_liens
  FOR SELECT TO authenticated
  USING (public.is_staff());

COMMIT;

-- Vérification :
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'taches' AND column_name IN ('reponse_entreprise', 'rappel_echeance', 'mise_en_demeure_le');
