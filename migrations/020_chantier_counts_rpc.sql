-- ══════════════════════════════════════════════════════════════
-- MIGRATION 020 — RPC chantier_attachment_counts (perf cold-start)
-- ══════════════════════════════════════════════════════════════
--
-- Contexte : avant cette migration, le dashboard chargeait toute la table
-- `attachments` (potentiellement 10k+ lignes sur un compte mature) juste
-- pour afficher le compteur "N PJ" par chantier dans la liste Chantiers.
--
-- Même avec un LIMIT 1000 temporaire côté client, c'est des dizaines de kB
-- de JSON inutiles et une lecture DB potentiellement coûteuse à chaque
-- démarrage.
--
-- Cette migration expose une FONCTION RPC qui agrège côté Postgres et
-- renvoie une ligne par chantier (≈50-200 lignes max sur un compte réel).
--
-- SÉCURITÉ :
--   - SECURITY INVOKER (par défaut depuis PG15 pour les functions) : la
--     fonction s'exécute avec les droits du caller, donc les RLS de la
--     table `attachments` s'appliquent. Un MOA ne voit que les chantiers
--     auxquels il a accès.
--   - STABLE : pas d'effet de bord, mémoïsable par le planner.

BEGIN;

CREATE OR REPLACE FUNCTION public.chantier_attachment_counts()
RETURNS TABLE (chantier_id uuid, n integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT chantier_id, COUNT(*)::int AS n
  FROM attachments
  WHERE chantier_id IS NOT NULL
  GROUP BY chantier_id
$$;

-- Index supportant le GROUP BY (optimise le plan d'exécution si la table
-- grossit). Idempotent via IF NOT EXISTS.
CREATE INDEX IF NOT EXISTS idx_attachments_chantier_id
  ON attachments (chantier_id)
  WHERE chantier_id IS NOT NULL;

-- Autorise l'appel depuis les clients authentifiés (anon + authenticated).
-- RLS continue de filtrer les lignes individuelles accessibles.
GRANT EXECUTE ON FUNCTION public.chantier_attachment_counts() TO anon, authenticated;

COMMIT;

-- ─── Fallback ROLLBACK ─────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.chantier_attachment_counts();
-- DROP INDEX IF EXISTS idx_attachments_chantier_id;
