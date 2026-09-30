-- 033 — Comptes rendus « intelligents » : suivi des tâches d'un CR à l'autre
--         + convocation à la prochaine réunion
--
-- compte_rendus
--   prochaine_reunion : { date, heure, lieu } — convocation imprimée sur la
--                       page de garde et envoyée par mail aux convoqués.
--   taches_suivi      : photo des actions au moment du CR (tâche, entreprise,
--                       échéance, priorité, état : fait / en_cours / relance /
--                       nouveau, nombre de rappels). Le PDF d'un ancien CR
--                       reste fidèle même si les tâches ont bougé depuis.
--   intervenants (024) : chaque entrée peut désormais porter
--                       presence ('Présent' | 'Absent' | 'Excusé') et
--                       convoque (booléen) — pas de changement de schéma (JSONB).
--
-- taches
--   entreprise           : entreprise chargée de l'action (texte libre,
--                          proposé depuis les intervenants du chantier).
--   cr_origine_id/numero : CR dans lequel l'action a été créée.
--   nb_rappels           : nombre de CR où l'action a été relancée
--                          (non faite à l'échéance). Chaque relance monte la
--                          priorité d'un cran (En attente → En cours → Urgent).
--   dernier_rappel_cr_id : évite de compter deux fois la relance quand on
--                          modifie un CR déjà enregistré.
--
-- Sans cette migration l'application continue de fonctionner : les CR sont
-- enregistrés sans ces colonnes (message d'avertissement dans l'écran CR).
-- Idempotent : ré-exécutable sans erreur.

BEGIN;

ALTER TABLE public.compte_rendus
  ADD COLUMN IF NOT EXISTS prochaine_reunion JSONB,
  ADD COLUMN IF NOT EXISTS taches_suivi JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.taches
  ADD COLUMN IF NOT EXISTS entreprise TEXT,
  ADD COLUMN IF NOT EXISTS cr_origine_id UUID REFERENCES public.compte_rendus(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cr_origine_numero INTEGER,
  ADD COLUMN IF NOT EXISTS nb_rappels INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dernier_rappel_cr_id UUID;

CREATE INDEX IF NOT EXISTS idx_taches_chantier ON public.taches (chantier_id);
CREATE INDEX IF NOT EXISTS idx_compte_rendus_chantier ON public.compte_rendus (chantier_id, numero);

-- Rafraîchit le cache de schéma de l'API (nouvelles colonnes visibles tout de suite)
NOTIFY pgrst, 'reload schema';

COMMIT;
