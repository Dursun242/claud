-- ══════════════════════════════════════════════════════════════
-- MIGRATION 018 — Restreindre SELECT sur authorized_users
--                 (remplace la policy wide-open de la migration 010)
-- ══════════════════════════════════════════════════════════════
--
-- PROBLÈME CORRIGÉ
--   La migration 010 ouvrait le SELECT de authorized_users à tout
--   utilisateur authentifié (USING (true)) pour permettre aux clients
--   MOA de résoudre les destinataires de notifications.
--   Conséquence : un client pouvait lister emails + nom + prénom +
--   rôle de tous les utilisateurs (staff + autres clients) → fuite
--   d'informations personnelles.
--
-- APPROCHE
--   On restreint la policy à « admin ou soi-même » et on expose la
--   liste des destinataires de notifications via 3 fonctions
--   SECURITY DEFINER qui ne retournent que l'info strictement
--   nécessaire (emails et display name), sans permettre
--   l'énumération de la table.
--
-- MIGRATION CÔTÉ CODE
--   src/app/lib/notifications.js doit être mis à jour pour appeler
--   ces RPC au lieu de SELECT direct. C'est fait dans le même commit.
--
-- ROUTES API NON IMPACTÉES
--   /api/admin/users et /api/admin/reset-demo-data utilisent le
--   SERVICE_ROLE_KEY → bypass RLS, rien ne change.
--   shared.js (panel admin users) n'est accessible qu'aux admins et
--   la nouvelle policy admin-or-self leur laisse le full SELECT.
-- ══════════════════════════════════════════════════════════════

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- 1. Fonctions SECURITY DEFINER pour notifications
-- ──────────────────────────────────────────────────────────────

-- Résout le display name (prénom/nom/rôle) d'un email donné.
-- Utilisé par resolveActorDisplay() pour afficher « Jean Dupont (admin) »
-- dans le titre des notifications.
CREATE OR REPLACE FUNCTION public.get_user_display(p_email TEXT)
RETURNS TABLE (prenom TEXT, nom TEXT, role TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT prenom, nom, role
  FROM authorized_users
  WHERE lower(trim(email)) = lower(trim(p_email))
    AND actif = true
  LIMIT 1
$$;

-- Liste des emails du staff actif (admin + salarié).
-- Utilisé par resolveRecipients() pour notifier le staff à chaque action.
CREATE OR REPLACE FUNCTION public.get_staff_recipients()
RETURNS TABLE (email TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email
  FROM authorized_users
  WHERE actif = true
    AND role IN ('admin', 'salarié', 'salarie')
$$;

-- Liste des emails des clients actifs matchant un prénom.
-- Utilisé par resolveRecipients() pour notifier le MOA concerné par
-- un chantier (matching par prénom — pattern existant du projet).
CREATE OR REPLACE FUNCTION public.get_client_recipients_by_firstname(p_firstname TEXT)
RETURNS TABLE (email TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email
  FROM authorized_users
  WHERE actif = true
    AND role = 'client'
    AND lower(trim(prenom)) = lower(trim(p_firstname))
$$;

GRANT EXECUTE ON FUNCTION public.get_user_display(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_recipients() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_recipients_by_firstname(TEXT) TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- 2. Policy SELECT restrictive (remplace la 010)
-- ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "authorized_users_select" ON authorized_users;

CREATE POLICY "authorized_users_select" ON authorized_users
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR lower(trim(email)) = public.auth_email()
  );

COMMIT;
