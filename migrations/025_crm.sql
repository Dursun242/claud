-- ══════════════════════════════════════════════════════════════
-- MIGRATION 025 — Module CRM (pipeline commercial + interactions)
-- ══════════════════════════════════════════════════════════════
--
-- CONTEXTE
--
-- Avant un chantier, il y a une opportunité : un prospect qui appelle,
-- une visite, un devis envoyé, une négociation… Jusqu'ici tout cela
-- vivait hors de l'application (mails, carnet, tableur). Ce module ajoute :
--
--   1. crm_opportunites  : le pipeline commercial (une ligne par affaire
--                          potentielle), avec étape, montant estimé,
--                          probabilité, contact rattaché et chantier
--                          créé lors de la conversion.
--   2. crm_interactions  : l'historique des échanges (appel, email,
--                          réunion, visite, note) rattachés à une
--                          opportunité et/ou à un contact, avec la
--                          prochaine action à mener et sa date.
--
-- SÉCURITÉ
--
-- Même modèle que `contacts` (005_rls_proper.sql) : réservé au staff
-- (admin / salarié) via public.is_staff(). Un MOA ne voit jamais le
-- pipeline commercial.
--
-- IMPACT
--
-- - Tables neuves : zéro impact sur l'existant.
-- - FK vers contacts (ON DELETE SET NULL) et chantiers (ON DELETE SET NULL)
--   pour ne jamais bloquer la suppression d'un contact ou d'un chantier.
-- - Le front retombe silencieusement sur un pipeline vide si la
--   migration n'est pas encore appliquée (cf. lib/crmDb.js).
-- ══════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. OPPORTUNITÉS ───
CREATE TABLE IF NOT EXISTS public.crm_opportunites (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titre                TEXT NOT NULL,
  etape                TEXT NOT NULL DEFAULT 'Prospect'
                       CHECK (etape IN ('Prospect','Qualifié','Devis envoyé','Négociation','Gagné','Perdu')),
  contact_id           UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  chantier_id          UUID REFERENCES public.chantiers(id) ON DELETE SET NULL,
  montant_estime       NUMERIC(12,2) NOT NULL DEFAULT 0,
  probabilite          INTEGER NOT NULL DEFAULT 20
                       CHECK (probabilite BETWEEN 0 AND 100),
  source               TEXT,                 -- Bouche à oreille, Site web, Architecte, Appel entrant…
  type_projet          TEXT,                 -- Rénovation, Construction neuve, Extension…
  adresse              TEXT,
  date_cloture_prevue  DATE,
  date_cloture         DATE,                 -- renseignée au passage Gagné / Perdu
  motif_perte          TEXT,
  notes                TEXT,
  created_by           TEXT,                 -- email de l'utilisateur (auth.jwt()->>'email')
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.crm_opportunites IS
  'Pipeline commercial : une ligne par affaire potentielle. '
  'chantier_id est renseigné lorsque l''opportunité est convertie en chantier.';

CREATE INDEX IF NOT EXISTS idx_crm_opp_etape      ON public.crm_opportunites (etape);
CREATE INDEX IF NOT EXISTS idx_crm_opp_contact    ON public.crm_opportunites (contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_opp_chantier   ON public.crm_opportunites (chantier_id);
CREATE INDEX IF NOT EXISTS idx_crm_opp_updated    ON public.crm_opportunites (updated_at DESC);

-- ─── 2. INTERACTIONS ───
CREATE TABLE IF NOT EXISTS public.crm_interactions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunite_id         UUID REFERENCES public.crm_opportunites(id) ON DELETE CASCADE,
  contact_id             UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  type                   TEXT NOT NULL DEFAULT 'Note'
                         CHECK (type IN ('Appel','Email','Réunion','Visite','Note')),
  sujet                  TEXT NOT NULL,
  contenu                TEXT,
  date                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  prochaine_action       TEXT,
  prochaine_action_date  DATE,
  action_faite           BOOLEAN NOT NULL DEFAULT false,
  created_by             TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.crm_interactions IS
  'Historique des échanges commerciaux (appel, email, réunion, visite, note) '
  'avec la prochaine action à mener. Au moins un rattachement attendu : '
  'opportunité et/ou contact.';

CREATE INDEX IF NOT EXISTS idx_crm_int_opp        ON public.crm_interactions (opportunite_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_crm_int_contact    ON public.crm_interactions (contact_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_crm_int_next       ON public.crm_interactions (prochaine_action_date)
  WHERE action_faite = false AND prochaine_action_date IS NOT NULL;

-- ─── 3. updated_at automatique ───
CREATE OR REPLACE FUNCTION public.crm_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_opp_updated_at ON public.crm_opportunites;
CREATE TRIGGER trg_crm_opp_updated_at
  BEFORE UPDATE ON public.crm_opportunites
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

-- ─── 4. RLS : staff uniquement (même modèle que contacts) ───
ALTER TABLE public.crm_opportunites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_opportunites_all" ON public.crm_opportunites;
CREATE POLICY "crm_opportunites_all" ON public.crm_opportunites
  FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

ALTER TABLE public.crm_interactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_interactions_all" ON public.crm_interactions;
CREATE POLICY "crm_interactions_all" ON public.crm_interactions
  FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

COMMIT;
