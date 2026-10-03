-- 036 — Documents administratifs des entreprises (obligation de vigilance)
--
-- Pour chaque entreprise (contact) : Kbis, attestation d'assurance
-- décennale, attestation de régularité fiscale, attestation de vigilance
-- URSSAF. Les fichiers sont dans le bucket `attachments` (préfixe
-- `conformite/`), déposés par l'équipe ou par l'entreprise elle-même via un
-- lien sécurisé (/deposer/<jeton>, sans compte). Les dates lues par l'IA
-- (date du document, fin de validité) servent aux alertes.
--
-- Écriture par le serveur uniquement (service role, routes /api/conformite) ;
-- lecture réservée à l'équipe (RLS is_staff()). Le maître d'ouvrage n'y a
-- pas accès. Idempotent : ré-exécutable sans erreur.

BEGIN;

CREATE TABLE IF NOT EXISTS public.contact_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id     UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('kbis', 'decennale', 'fiscale', 'urssaf')),
  file_path      TEXT NOT NULL,
  file_name      TEXT,
  depose_par     TEXT NOT NULL DEFAULT 'equipe' CHECK (depose_par IN ('equipe', 'entreprise')),
  -- Lu sur le document (IA) ou corrigé à la main
  date_document  DATE,          -- date de délivrance / de l'extrait
  valide_du      DATE,
  valide_au      DATE,          -- fin de validité retenue pour les alertes
  siret_lu       TEXT,
  raison_sociale TEXT,
  assureur       TEXT,
  numero_police  TEXT,
  activites      TEXT,
  code_securite  TEXT,          -- attestation URSSAF : code de vérification
  anomalies      TEXT[] NOT NULL DEFAULT '{}',
  lecture        TEXT NOT NULL DEFAULT 'auto' CHECK (lecture IN ('auto', 'manuelle', 'echec')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_documents_contact_idx
  ON public.contact_documents (contact_id, kind, created_at DESC);

ALTER TABLE public.contact_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contact_documents_select" ON public.contact_documents;
CREATE POLICY "contact_documents_select" ON public.contact_documents
  FOR SELECT TO authenticated
  USING (public.is_staff());

-- Demandes de documents envoyées aux entreprises (lien de dépôt)
CREATE TABLE IF NOT EXISTS public.contact_doc_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  token         TEXT NOT NULL UNIQUE,
  email         TEXT,
  auto          BOOLEAN NOT NULL DEFAULT false,   -- relance automatique (cron)
  envois        INTEGER NOT NULL DEFAULT 1,
  dernier_envoi TIMESTAMPTZ NOT NULL DEFAULT now(),
  expire_le     TIMESTAMPTZ NOT NULL,
  derniere_visite TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_doc_requests_contact_idx
  ON public.contact_doc_requests (contact_id, created_at DESC);

ALTER TABLE public.contact_doc_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contact_doc_requests_select" ON public.contact_doc_requests;
CREATE POLICY "contact_doc_requests_select" ON public.contact_doc_requests
  FOR SELECT TO authenticated
  USING (public.is_staff());

COMMIT;

-- Vérification :
-- SELECT tablename, policyname FROM pg_policies
-- WHERE tablename IN ('contact_documents', 'contact_doc_requests');
