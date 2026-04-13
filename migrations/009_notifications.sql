-- ══════════════════════════════════════════════════════════════
-- MIGRATION 009 — Notifications in-app
-- ══════════════════════════════════════════════════════════════
-- Table `notifications` : chaque utilisateur reçoit une notification
-- quand un nouveau document est créé sur un de ses chantiers.
--
-- Destinataires :
--   - Staff (admin/salarié) : notifié pour TOUT nouveau document,
--     sauf celui créé par lui-même (on évite de se notifier soi-même).
--   - Client (MOA)          : notifié pour les documents créés sur
--     le(s) chantier(s) dont il est le maître d'ouvrage.
--
-- L'app remplit la table côté JS au moment d'un SB.upsert*.
--
-- Dépendances : helpers is_staff(), auth_email() de la migration 005.
-- ══════════════════════════════════════════════════════════════

BEGIN;

-- Création de la table
CREATE TABLE IF NOT EXISTS notifications (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_email  TEXT        NOT NULL,
  actor_email      TEXT,
  kind             TEXT        NOT NULL,            -- 'create' | 'update' | 'delete'
  entity_type      TEXT        NOT NULL,            -- 'chantier' | 'os' | 'cr' | 'task' | 'attachment' | 'comment'
  entity_id        UUID,
  chantier_id      UUID,
  title            TEXT        NOT NULL,
  body             TEXT,
  target_tab       TEXT,                            -- 'projects' | 'os' | 'reports' | 'tasks' | 'photos'
  read_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Index pour charger rapidement les notifs d'un user, triées par date DESC
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
  ON notifications (lower(recipient_email), created_at DESC);

-- Index pour compter les non-lues
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications (lower(recipient_email)) WHERE read_at IS NULL;

-- ─── RLS ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "notifications_select"        ON notifications;
DROP POLICY IF EXISTS "notifications_insert"        ON notifications;
DROP POLICY IF EXISTS "notifications_update_read"   ON notifications;
DROP POLICY IF EXISTS "notifications_delete"        ON notifications;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- SELECT : chaque utilisateur ne voit que SES notifications
CREATE POLICY "notifications_select" ON notifications FOR SELECT TO authenticated
  USING (lower(trim(recipient_email)) = public.auth_email());

-- INSERT : n'importe quel utilisateur authentifié peut créer une notif
-- pour autrui (l'app est responsable de router correctement). On restreint
-- en imposant actor_email = utilisateur courant pour éviter le spoofing.
CREATE POLICY "notifications_insert" ON notifications FOR INSERT TO authenticated
  WITH CHECK (
    actor_email IS NULL
    OR lower(trim(actor_email)) = public.auth_email()
    OR public.is_staff()
  );

-- UPDATE : seulement son propre read_at (on ne vérifie pas le diff exact,
-- juste que la ligne appartient bien à l'utilisateur)
CREATE POLICY "notifications_update_read" ON notifications FOR UPDATE TO authenticated
  USING (lower(trim(recipient_email)) = public.auth_email())
  WITH CHECK (lower(trim(recipient_email)) = public.auth_email());

-- DELETE : on peut supprimer ses propres notifs
CREATE POLICY "notifications_delete" ON notifications FOR DELETE TO authenticated
  USING (lower(trim(recipient_email)) = public.auth_email());

COMMIT;
