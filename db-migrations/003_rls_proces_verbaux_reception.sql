-- ══════════════════════════════════════════════════════════════
-- MIGRATION 003 — RLS sur proces_verbaux_reception
-- ══════════════════════════════════════════════════════════════
--
-- CONTEXTE
--
-- La table `proces_verbaux_reception` a été créée par
-- `db-migrations/001_procès_verbaux_reception.sql` sans activer
-- Row Level Security. Le Supabase linter la signale (lint 0013
-- `rls_disabled_in_public`) : la table est exposée via PostgREST
-- mais aucune policy ne filtre l'accès — un MOA authentifié peut
-- requêter tous les PV de tous les chantiers via l'API REST.
--
-- Cf. https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public
--
-- APPROCHE
--
-- On aligne sur le pattern des autres tables liées à un chantier
-- (`ordres_service`, `compte_rendus`, `taches`, `planning`) défini
-- dans `migrations/005_rls_proper.sql` :
--   - SELECT : staff (admin/salarié) OU client du chantier ;
--   - INSERT / UPDATE : staff ;
--   - DELETE : admin uniquement (un PV signé est un document
--     contractuel — on évite qu'un salarié l'efface par erreur).
--
-- Les helpers `is_staff()`, `is_admin()`, `client_has_chantier()`
-- viennent de la migration `005_rls_proper.sql` (mise à jour par
-- `019_client_user_id.sql`) — préqrequis pour cette migration.
--
-- IMPACT API
--
-- - `/api/pv-reception/list` utilise `userClientFromToken()` : la
--   RLS s'applique et restreint correctement les MOA à leurs
--   chantiers.
-- - `/api/pv-reception/create`, `/decision`, `/sync-signatures`
--   utilisent `adminClient()` (service role) : RLS bypassée, donc
--   aucun changement de comportement.

BEGIN;

ALTER TABLE proces_verbaux_reception ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proces_verbaux_reception_select" ON proces_verbaux_reception;
CREATE POLICY "proces_verbaux_reception_select"
  ON proces_verbaux_reception FOR SELECT TO authenticated
  USING (
    public.is_staff()
    OR (chantier_id IS NOT NULL AND public.client_has_chantier(chantier_id))
  );

DROP POLICY IF EXISTS "proces_verbaux_reception_insert" ON proces_verbaux_reception;
CREATE POLICY "proces_verbaux_reception_insert"
  ON proces_verbaux_reception FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "proces_verbaux_reception_update" ON proces_verbaux_reception;
CREATE POLICY "proces_verbaux_reception_update"
  ON proces_verbaux_reception FOR UPDATE TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "proces_verbaux_reception_delete" ON proces_verbaux_reception;
CREATE POLICY "proces_verbaux_reception_delete"
  ON proces_verbaux_reception FOR DELETE TO authenticated
  USING (public.is_admin());

COMMIT;

-- ══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ══════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP POLICY IF EXISTS "proces_verbaux_reception_select" ON proces_verbaux_reception;
-- DROP POLICY IF EXISTS "proces_verbaux_reception_insert" ON proces_verbaux_reception;
-- DROP POLICY IF EXISTS "proces_verbaux_reception_update" ON proces_verbaux_reception;
-- DROP POLICY IF EXISTS "proces_verbaux_reception_delete" ON proces_verbaux_reception;
-- ALTER TABLE proces_verbaux_reception DISABLE ROW LEVEL SECURITY;
-- COMMIT;
