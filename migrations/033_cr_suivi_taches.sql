-- 033 — Comptes rendus de chantier : refonte (points suivis par lot d'un CR
--         à l'autre, avancement par lot, photos, convocation, brouillon)
--
-- compte_rendus
--   sections          : une entrée par lot (+ « Généralités ») :
--                       { lot, entreprise, avancement, avancement_prec, prevu,
--                         observations, photos: [{ path, legende }] }.
--   taches_suivi      : photo des points au moment du CR (n°, lot, entreprise,
--                       échéance, priorité, état : fait / en_cours / relance /
--                       nouveau, rappels, photos). Le PDF d'un ancien CR reste
--                       fidèle même si les tâches ont bougé depuis.
--   prochaine_reunion : { date, heure, lieu, rdv_id } — convocation.
--   statut            : 'Brouillon' (non diffusé, invisible du maître
--                       d'ouvrage) ou 'Diffusé'. Les CR existants sont diffusés.
--   diffuse_le        : date d'envoi aux intervenants.
--   intervenants (024): entrées enrichies de presence ('Présent' | 'Absent' |
--                       'Excusé') et convoque (booléen) — JSONB, sans schéma.
--
-- taches (= points d'action des CR)
--   entreprise           : entreprise chargée du point.
--   num_point            : numéro du point, fixe d'un CR à l'autre (par chantier).
--   photos               : [{ path, legende }] — fichiers du bucket attachments.
--   cr_origine_id/numero : CR dans lequel le point a été créé.
--   nb_rappels           : nombre de CR où le point a été relancé (non fait à
--                          l'échéance). Chaque relance monte la priorité d'un
--                          cran (En attente → En cours → Urgent).
--   dernier_rappel_cr_id : évite de compter deux fois la relance quand on
--                          modifie un CR déjà enregistré.
--
-- Sans cette migration l'application continue de fonctionner : les CR sont
-- enregistrés sans ces colonnes (message d'avertissement dans l'écran CR).
-- Idempotent : ré-exécutable sans erreur.

BEGIN;

ALTER TABLE public.compte_rendus
  ADD COLUMN IF NOT EXISTS sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS taches_suivi JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS prochaine_reunion JSONB,
  ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'Diffusé',
  ADD COLUMN IF NOT EXISTS diffuse_le TIMESTAMPTZ;

ALTER TABLE public.taches
  ADD COLUMN IF NOT EXISTS entreprise TEXT,
  ADD COLUMN IF NOT EXISTS num_point INTEGER,
  ADD COLUMN IF NOT EXISTS photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cr_origine_id UUID REFERENCES public.compte_rendus(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cr_origine_numero INTEGER,
  ADD COLUMN IF NOT EXISTS nb_rappels INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dernier_rappel_cr_id UUID;

CREATE INDEX IF NOT EXISTS idx_taches_chantier ON public.taches (chantier_id);
CREATE INDEX IF NOT EXISTS idx_compte_rendus_chantier ON public.compte_rendus (chantier_id, numero);

-- Le maître d'ouvrage ne voit que les CR diffusés (pas les brouillons)
DROP POLICY IF EXISTS "compte_rendus_select" ON public.compte_rendus;
CREATE POLICY "compte_rendus_select" ON public.compte_rendus FOR SELECT TO authenticated USING (
  public.is_staff()
  OR (chantier_id IS NOT NULL AND statut <> 'Brouillon' AND public.client_has_chantier(chantier_id))
);

-- Rafraîchit le cache de schéma de l'API (nouvelles colonnes visibles tout de suite)
NOTIFY pgrst, 'reload schema';

COMMIT;
