-- 031 — Sécurité des fonctions internes + index manquants
--
-- 1. Les fonctions create_activity_notification(_ex) (011/012) et
--    chantier_name (011) sont SECURITY DEFINER et, par défaut sur Supabase,
--    exécutables par anon/authenticated via /rest/v1/rpc. N'importe quel
--    utilisateur pouvait donc créer des notifications envoyées à toute
--    l'équipe, avec un faux nom d'expéditeur.
--    Elles ne sont appelées que depuis les fonctions de trigger notify_on_*,
--    elles-mêmes SECURITY DEFINER (exécutées avec les droits du
--    propriétaire) : retirer EXECUTE aux rôles API ne casse pas les
--    notifications automatiques.
--
-- 2. Index sur chantier_id pour rdv et contact_chantiers (filtres et RLS
--    par chantier). L'index UNIQUE(contact_id, chantier_id) ne sert pas aux
--    recherches par chantier seul.
--
-- Idempotent : ré-exécutable sans erreur.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.create_activity_notification(TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.create_activity_notification_ex(TEXT, TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.chantier_name(UUID)
  FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_rdv_chantier ON public.rdv (chantier_id);
CREATE INDEX IF NOT EXISTS idx_contact_chantiers_chantier ON public.contact_chantiers (chantier_id);

COMMIT;

-- Vérification (doit renvoyer false pour les trois lignes) :
-- SELECT p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE')
-- FROM pg_proc p
-- WHERE p.pronamespace = 'public'::regnamespace
--   AND p.proname IN ('create_activity_notification', 'create_activity_notification_ex', 'chantier_name');
