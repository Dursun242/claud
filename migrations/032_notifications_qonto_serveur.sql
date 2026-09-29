-- 032 — Notifications et jeton Qonto : accès serveur uniquement
--
-- Depuis cette version, l'application ne calcule plus les destinataires des
-- notifications ni ne lit le jeton Qonto dans le navigateur :
--   - lib/notifications.js (routes API) passe par le service role ;
--   - le jeton Qonto est géré par /api/qonto/token (service role).
--
-- 1. Les RPC de 018 renvoyaient emails / rôles des utilisateurs à tout
--    compte connecté (un client pouvait deviner des prénoms et récupérer les
--    adresses d'autres clients). Plus aucun appel depuis le navigateur :
--    on retire EXECUTE aux rôles API.
-- 2. Aucune notification n'est plus insérée depuis le navigateur (triggers
--    SECURITY DEFINER + routes en service role) : la policy INSERT qui
--    permettait à tout compte connecté d'écrire dans la cloche des autres
--    est supprimée.
-- 3. Table settings : la ligne 'qonto-token' n'est plus lisible ni
--    modifiable via l'API Supabase (même par un admin), seulement par le
--    serveur. Les autres réglages gardent leurs droits (lecture staff,
--    écriture admin).
--
-- À appliquer APRÈS le déploiement de la version qui contient
-- /api/qonto/token (sinon l'écran Qonto ne voit plus la connexion).
-- Idempotent : ré-exécutable sans erreur.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.get_staff_recipients() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_client_recipients_by_firstname(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_display(TEXT) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;

DROP POLICY IF EXISTS "settings_select" ON public.settings;
CREATE POLICY "settings_select" ON public.settings FOR SELECT TO authenticated
  USING (public.is_staff() AND key <> 'qonto-token');

DROP POLICY IF EXISTS "settings_modify" ON public.settings;
CREATE POLICY "settings_modify" ON public.settings FOR ALL TO authenticated
  USING (public.is_admin() AND key <> 'qonto-token')
  WITH CHECK (public.is_admin() AND key <> 'qonto-token');

COMMIT;

-- Vérifications :
-- 1) false sur les trois lignes
-- SELECT p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE')
-- FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
--   AND p.proname IN ('get_staff_recipients', 'get_client_recipients_by_firstname', 'get_user_display');
-- 2) plus de policy INSERT sur notifications
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'notifications';
