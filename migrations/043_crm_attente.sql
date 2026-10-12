-- 043 — CRM : affaires « En attente »
--
-- Une affaire dont le client a mis le projet en pause (projet reporté,
-- attente du financement, du permis…) n'est ni gagnée ni perdue : elle
-- sort du pipeline actif et attend la date de reprise de contact.
--   - nouvelle étape 'En attente' pour crm_opportunites.etape
--   - date_reprise  : date à laquelle reprendre contact avec le client
--   - motif_attente : pourquoi l'affaire est en pause
-- Reprise de l'existant : les affaires en cours dont la dernière réponse du
-- client à une relance est « Projet reporté » ou « Attente du financement »
-- (migration 041) passent en attente.
-- Idempotent : ré-exécutable sans erreur. À appliquer après 042.

BEGIN;

ALTER TABLE public.crm_opportunites
  DROP CONSTRAINT IF EXISTS crm_opportunites_etape_check;
ALTER TABLE public.crm_opportunites
  ADD CONSTRAINT crm_opportunites_etape_check
  CHECK (etape IN ('Prospect','Qualifié','Devis envoyé','Négociation','En attente','Gagné','Perdu'));

ALTER TABLE public.crm_opportunites
  ADD COLUMN IF NOT EXISTS date_reprise DATE,
  ADD COLUMN IF NOT EXISTS motif_attente TEXT;

WITH derniere AS (
  SELECT DISTINCT ON (d.opportunite_id)
         d.opportunite_id, e.detail->>'raison' AS raison, e.created_at
    FROM public.crm_devis_events e
    JOIN public.crm_devis d ON d.id = e.devis_id
   WHERE e.kind = 'reponse' AND d.opportunite_id IS NOT NULL
   ORDER BY d.opportunite_id, e.created_at DESC
)
UPDATE public.crm_opportunites o
   SET etape = 'En attente',
       motif_attente = CASE r.raison WHEN 'reporte' THEN 'Projet reporté' ELSE 'Attente du financement' END,
       date_reprise = (r.created_at AT TIME ZONE 'Europe/Paris')::date
                      + CASE r.raison WHEN 'reporte' THEN 60 ELSE 30 END,
       updated_at = now()
  FROM derniere r
 WHERE o.id = r.opportunite_id
   AND r.raison IN ('reporte', 'financement')
   AND o.etape NOT IN ('Gagné', 'Perdu', 'En attente');

COMMIT;
