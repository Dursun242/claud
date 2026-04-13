-- ══════════════════════════════════════════════════════════════
-- MIGRATION 008 — Client peut gérer les tâches de ses chantiers
-- ══════════════════════════════════════════════════════════════
-- Avant : seuls admin/salarié peuvent INSERT/UPDATE/DELETE sur taches.
-- Après : un client (MOA) peut également créer et modifier les tâches
--         des chantiers dont il est le MOA (via client_has_chantier).
--
-- La suppression reste réservée au staff : un client ne peut pas
-- supprimer une tâche créée par un admin par inadvertance.
--
-- Dépendances : helpers is_staff() et client_has_chantier() de la
-- migration 005.
-- ══════════════════════════════════════════════════════════════

BEGIN;

-- Drop les anciennes policies
DROP POLICY IF EXISTS "taches_insert" ON taches;
DROP POLICY IF EXISTS "taches_update" ON taches;
DROP POLICY IF EXISTS "taches_delete" ON taches;

-- INSERT : staff OU client sur SON chantier
CREATE POLICY "taches_insert" ON taches FOR INSERT TO authenticated
  WITH CHECK (
    public.is_staff()
    OR (chantier_id IS NOT NULL AND public.client_has_chantier(chantier_id))
  );

-- UPDATE : staff OU client sur SON chantier
-- (permet au client de cocher "Terminé", changer la priorité, l'échéance, etc.)
CREATE POLICY "taches_update" ON taches FOR UPDATE TO authenticated
  USING (
    public.is_staff()
    OR (chantier_id IS NOT NULL AND public.client_has_chantier(chantier_id))
  )
  WITH CHECK (
    public.is_staff()
    OR (chantier_id IS NOT NULL AND public.client_has_chantier(chantier_id))
  );

-- DELETE : staff uniquement (sécurité — le client demande à son MOE)
CREATE POLICY "taches_delete" ON taches FOR DELETE TO authenticated
  USING (public.is_staff());

COMMIT;
