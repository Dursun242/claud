-- 039 — Documents des entreprises : contrôle automatique de la situation légale
--
-- Dernier contrôle de chaque entreprise auprès de sources publiques :
-- annuaire des entreprises (entreprise active / fermée) et BODACC
-- (procédures collectives : sauvegarde, redressement, liquidation ;
-- radiations). Mis à jour chaque jour ouvré par /api/cron/conformite et à
-- la demande (« Vérifier maintenant »). Écriture serveur, lecture équipe.
-- À appliquer après 038. Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS public.contact_legal_checks (
  contact_id  UUID PRIMARY KEY REFERENCES public.contacts(id) ON DELETE CASCADE,
  siren       TEXT,
  statut      TEXT NOT NULL CHECK (statut IN ('ok', 'alerte', 'critique', 'inconnu')),
  libelle     TEXT,
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_legal_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contact_legal_checks_select" ON public.contact_legal_checks;
CREATE POLICY "contact_legal_checks_select" ON public.contact_legal_checks
  FOR SELECT TO authenticated
  USING (public.is_staff());

COMMIT;
