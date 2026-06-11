-- Migration: activer la RLS sur proces_verbaux_reception
--
-- Contexte (audit 2026-06-11) : la table avait été créée (001) sans
-- ENABLE ROW LEVEL SECURITY ni policy. Sur Supabase, une table publique
-- sans RLS est lisible/modifiable par tout utilisateur authentifié via
-- PostgREST avec la clé anon — n'importe quel client MOA pouvait donc
-- lire les PV de tous les chantiers.
--
-- Prérequis : migrations/005_rls_proper.sql appliquée (fonctions
-- public.is_staff() et public.client_has_chantier()).
--
-- Impact applicatif : aucun. Les écritures PV (create, decision,
-- sync-signatures) passent par les routes /api/pv-reception/* en service
-- role (bypass RLS). Seule la lecture via /api/pv-reception/list utilise
-- le JWT utilisateur et hérite donc de la policy SELECT ci-dessous.

ALTER TABLE proces_verbaux_reception ENABLE ROW LEVEL SECURITY;

-- Lecture : staff = tout, client = uniquement les PV de SES chantiers
DROP POLICY IF EXISTS "pv_select" ON proces_verbaux_reception;
CREATE POLICY "pv_select" ON proces_verbaux_reception
  FOR SELECT TO authenticated
  USING (public.is_staff() OR public.client_has_chantier(chantier_id));

-- Écritures : staff uniquement (les flux client passent par l'API en service role)
DROP POLICY IF EXISTS "pv_write_staff" ON proces_verbaux_reception;
CREATE POLICY "pv_write_staff" ON proces_verbaux_reception
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());
