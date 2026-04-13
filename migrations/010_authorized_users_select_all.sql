-- ══════════════════════════════════════════════════════════════
-- MIGRATION 010 — Notifications : autoriser les clients à lire
--                authorized_users pour la résolution des destinataires
-- ══════════════════════════════════════════════════════════════
-- Pourquoi :
-- Quand un MOA (client) crée une tâche, l'app appelle resolveRecipients
-- qui fait SELECT sur authorized_users pour lister :
--   - les admins/salariés à notifier
--   - les clients MOA matchant le prénom du chantier
-- Or la RLS actuelle (migration 005) n'autorise SELECT qu'au staff.
-- → le client ne peut pas lister → recipients vide → aucune notif créée.
--
-- Fix : SELECT ouvert à tout utilisateur authentifié. Il n'y a rien de
-- sensible dans authorized_users (prénom/email/rôle/actif) comparé à ce
-- qui est déjà visible dans contacts ou chantiers.client.
-- INSERT / UPDATE / DELETE restent admin-only (inchangés).
-- ══════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS "authorized_users_select" ON authorized_users;

CREATE POLICY "authorized_users_select" ON authorized_users FOR SELECT TO authenticated
  USING (true);

COMMIT;
