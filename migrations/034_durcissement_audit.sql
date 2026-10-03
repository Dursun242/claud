-- 034 — Durcissement (suite d'audit)
--
-- 1. seed_demo_data() (014/015/016) et resolve_client_user_id(TEXT) (019)
--    sont SECURITY DEFINER et, par défaut sur Supabase, exécutables par
--    anon/authenticated via /rest/v1/rpc :
--      - seed_demo_data : n'importe quel compte pouvait purger et recréer
--        les chantiers de démo ;
--      - resolve_client_user_id : lit auth.users, permettait de tester des
--        prénoms pour retrouver l'identifiant d'un client.
--    Appels légitimes : /api/admin/reset-demo-data (service role) et le
--    trigger chantiers_fill_client_user_id (SECURITY DEFINER, droits du
--    propriétaire). Aucun appel RPC depuis le navigateur.
--
-- 2. notify_on_cr_update (012) : un CR encore en « Brouillon » (colonne
--    statut, 033) ne notifie plus à chaque enregistrement. La notification
--    part quand le CR est diffusé. Corps repris de 012, seule la condition
--    est ajoutée.
--
-- 3. Storage, bucket attachments (021) : DELETE et UPDATE réservés à
--    l'équipe. Avant, un maître d'ouvrage qui voit la ligne attachments
--    pouvait supprimer ou écraser les fichiers de son chantier (la table
--    attachments, elle, n'est déjà modifiable que par l'équipe — 005).
--    La policy INSERT (dépôt direct depuis le navigateur) ne change pas.
--
-- Prérequis : 033 appliquée (colonne compte_rendus.statut).
-- Idempotent : ré-exécutable sans erreur.

BEGIN;

-- ─── 1. Fonctions internes : plus d'exécution via l'API ───────
REVOKE EXECUTE ON FUNCTION public.seed_demo_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_demo_data() TO service_role;

REVOKE EXECUTE ON FUNCTION public.resolve_client_user_id(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_client_user_id(TEXT) TO service_role;

-- ─── 2. Pas de notification pour un CR en brouillon ───────────
CREATE OR REPLACE FUNCTION public.notify_on_cr_update() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor TEXT; display TEXT; ch_name TEXT;
BEGIN
  -- CR non diffusé : rien à annoncer
  IF NEW.statut = 'Brouillon' THEN
    RETURN NEW;
  END IF;

  actor := public.auth_email();
  display := public.current_actor_display();
  ch_name := public.chantier_name(NEW.chantier_id);

  PERFORM public.create_activity_notification_ex(
    'update', 'cr', NEW.id, NEW.chantier_id, actor,
    'Compte rendu n°' || COALESCE(NEW.numero::TEXT, '') || ' modifié'
      || CASE WHEN ch_name IS NOT NULL THEN ' sur ' || ch_name ELSE '' END
      || CASE WHEN display IS NOT NULL THEN ' — par ' || display ELSE '' END,
    'CR mis à jour' || CASE WHEN NEW.resume IS NOT NULL AND NEW.resume <> '' THEN ' · ' || left(NEW.resume, 100) ELSE '' END,
    'reports'
  );
  RETURN NEW;
END; $$;

-- ─── 3. Storage : suppression / écrasement réservés à l'équipe ─
DROP POLICY IF EXISTS "attachments_delete_granular" ON storage.objects;
CREATE POLICY "attachments_delete_granular"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'attachments'
    AND public.is_staff()
    AND EXISTS (
      SELECT 1 FROM public.attachments a
      WHERE a.file_path = storage.objects.name
    )
  );

DROP POLICY IF EXISTS "attachments_update_granular" ON storage.objects;
CREATE POLICY "attachments_update_granular"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'attachments'
    AND public.is_staff()
    AND EXISTS (
      SELECT 1 FROM public.attachments a
      WHERE a.file_path = storage.objects.name
    )
  );

COMMIT;

-- Vérifications :
-- 1) false sur les deux lignes
-- SELECT p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE')
-- FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
--   AND p.proname IN ('seed_demo_data', 'resolve_client_user_id');
-- 2) is_staff() présent dans les deux policies
-- SELECT policyname, cmd, qual FROM pg_policies
-- WHERE schemaname = 'storage' AND tablename = 'objects'
--   AND policyname IN ('attachments_delete_granular', 'attachments_update_granular');
