-- ══════════════════════════════════════════════════════════════
-- MIGRATION 027 — Module Devis (rattaché aux opportunités CRM)
-- ══════════════════════════════════════════════════════════════
--
-- CONTEXTE
--
-- Une fois l'affaire « Qualifiée », l'étape suivante est d'envoyer un
-- devis. Jusqu'ici on passait directement l'affaire en « Devis envoyé »
-- sans que le devis existe dans l'application. Cette table stocke les
-- devis rédigés depuis la fiche affaire (lignes, totaux, statut), le PDF
-- étant régénéré à la demande côté client (generators.js).
--
-- STATUTS
--
--   Brouillon → Envoyé → Accepté | Refusé
--
-- - « Envoyé » fait passer l'affaire en « Devis envoyé » (montant estimé
--   = total HT du devis) ; « Accepté » propose de la passer « Gagné ».
-- - Plusieurs devis par affaire possibles (variantes, révisions).
--
-- SÉCURITÉ
--
-- Même modèle que crm_opportunites (025) : staff uniquement.
--
-- IMPACT
--
-- - Table neuve : zéro impact sur l'existant.
-- - ON DELETE CASCADE depuis l'opportunité.
-- - Le front masque la section Devis si la migration n'est pas appliquée.
-- ══════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.crm_devis (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunite_id      UUID NOT NULL REFERENCES public.crm_opportunites(id) ON DELETE CASCADE,
  numero              TEXT NOT NULL,          -- DEV-2026-001
  statut              TEXT NOT NULL DEFAULT 'Brouillon'
                      CHECK (statut IN ('Brouillon','Envoyé','Accepté','Refusé')),
  objet               TEXT,
  date_emission       DATE NOT NULL DEFAULT CURRENT_DATE,
  date_validite       DATE,
  -- [{ type: 'ligne'|'titre', designation, unite, quantite, prix_unitaire, tva_taux }]
  lignes              JSONB NOT NULL DEFAULT '[]'::jsonb,
  remise_pct          NUMERIC(5,2) NOT NULL DEFAULT 0
                      CHECK (remise_pct BETWEEN 0 AND 100),
  acompte_pct         NUMERIC(5,2) NOT NULL DEFAULT 0
                      CHECK (acompte_pct BETWEEN 0 AND 100),
  conditions          TEXT,
  notes               TEXT,                   -- notes internes (non imprimées)
  total_ht            NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_tva           NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_ttc           NUMERIC(12,2) NOT NULL DEFAULT 0,
  date_envoi          DATE,
  date_reponse        DATE,
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.crm_devis IS
  'Devis rédigés depuis une opportunité CRM. Totaux dénormalisés '
  '(recalculés côté client à chaque enregistrement) pour les listes.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_devis_numero ON public.crm_devis (numero);
CREATE INDEX IF NOT EXISTS idx_crm_devis_opp ON public.crm_devis (opportunite_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_crm_devis_updated_at ON public.crm_devis;
CREATE TRIGGER trg_crm_devis_updated_at
  BEFORE UPDATE ON public.crm_devis
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

ALTER TABLE public.crm_devis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_devis_all" ON public.crm_devis;
CREATE POLICY "crm_devis_all" ON public.crm_devis
  FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

COMMIT;
