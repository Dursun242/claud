-- ══════════════════════════════════════════════════════════════
-- MIGRATION 011 — Notifications via triggers SQL (plus fiable que JS)
-- ══════════════════════════════════════════════════════════════
-- Remplace le système côté JS (createNotifications dans shared.js) par
-- des triggers Postgres qui s'exécutent à chaque INSERT sur les tables
-- métier. Avantages :
--   - Marche peu importe d'où vient l'insert (UI, IA, SQL direct, import…)
--   - Pas d'exception silencieuse côté JS
--   - SECURITY DEFINER → pas de problème de RLS pour lire authorized_users
--
-- Tables couvertes : chantiers, taches, compte_rendus, ordres_service,
-- attachments.
-- ══════════════════════════════════════════════════════════════

BEGIN;

-- ─── Fonction helper : crée une notif par destinataire ─────────────
CREATE OR REPLACE FUNCTION public.create_activity_notification(
  p_entity_type TEXT,
  p_entity_id   UUID,
  p_chantier_id UUID,
  p_actor_email TEXT,
  p_title       TEXT,
  p_body        TEXT,
  p_target_tab  TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r                RECORD;
  v_client_prenom  TEXT;
BEGIN
  -- 1. Staff (admin + salarié) : TOUS les actifs
  FOR r IN
    SELECT DISTINCT lower(trim(email)) AS email
    FROM authorized_users
    WHERE actif = true
      AND role IN ('admin', 'salarié', 'salarie')
      AND email IS NOT NULL
  LOOP
    INSERT INTO notifications (recipient_email, actor_email, kind, entity_type, entity_id, chantier_id, title, body, target_tab)
    VALUES (r.email, p_actor_email, 'create', p_entity_type, p_entity_id, p_chantier_id, p_title, p_body, p_target_tab);
  END LOOP;

  -- 2. Client MOA du chantier (matching prénom)
  IF p_chantier_id IS NOT NULL THEN
    SELECT lower(trim(client)) INTO v_client_prenom FROM chantiers WHERE id = p_chantier_id;
    IF v_client_prenom IS NOT NULL AND v_client_prenom <> '' THEN
      FOR r IN
        SELECT DISTINCT lower(trim(email)) AS email
        FROM authorized_users
        WHERE actif = true
          AND role = 'client'
          AND lower(trim(COALESCE(prenom, ''))) = v_client_prenom
          AND email IS NOT NULL
      LOOP
        INSERT INTO notifications (recipient_email, actor_email, kind, entity_type, entity_id, chantier_id, title, body, target_tab)
        VALUES (r.email, p_actor_email, 'create', p_entity_type, p_entity_id, p_chantier_id, p_title, p_body, p_target_tab);
      END LOOP;
    END IF;
  END IF;
END;
$$;

-- ─── Helper : display-name de l'acteur courant ─────────────────────
CREATE OR REPLACE FUNCTION public.current_actor_display() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(trim(COALESCE(prenom, '') || ' ' || COALESCE(nom, '')), '')
      || CASE WHEN role IS NOT NULL THEN ' (' || role || ')' ELSE '' END,
    split_part(public.auth_email(), '@', 1)
  )
  FROM authorized_users
  WHERE lower(trim(email)) = public.auth_email()
  LIMIT 1
$$;

-- ─── Helper : nom de chantier ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.chantier_name(p_id UUID) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nom FROM chantiers WHERE id = p_id LIMIT 1
$$;

-- ─── Helper : formatter un montant en € ────────────────────────────
CREATE OR REPLACE FUNCTION public.fmt_money(v NUMERIC) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN v IS NULL THEN NULL ELSE to_char(round(v), 'FM999G999G999') || ' €' END
$$;

-- ═══════════════════════════════════════════════════════════════════
-- TRIGGERS PAR TABLE
-- ═══════════════════════════════════════════════════════════════════

-- CHANTIER
CREATE OR REPLACE FUNCTION public.notify_on_chantier_insert() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor TEXT; display TEXT;
  body_parts TEXT[];
BEGIN
  actor := public.auth_email();
  display := public.current_actor_display();
  body_parts := ARRAY[]::TEXT[];
  IF NEW.client    IS NOT NULL AND NEW.client    <> '' THEN body_parts := body_parts || ('Client : '  || NEW.client);    END IF;
  IF NEW.phase     IS NOT NULL AND NEW.phase     <> '' THEN body_parts := body_parts || ('Phase : '   || NEW.phase);     END IF;
  IF NEW.budget    IS NOT NULL AND NEW.budget    > 0  THEN body_parts := body_parts || ('Budget : '  || public.fmt_money(NEW.budget)); END IF;
  IF NEW.adresse   IS NOT NULL AND NEW.adresse   <> '' THEN body_parts := body_parts || left(NEW.adresse, 80); END IF;

  PERFORM public.create_activity_notification(
    'chantier', NEW.id, NEW.id, actor,
    'Nouveau chantier : ' || COALESCE(NEW.nom, '—')
      || CASE WHEN display IS NOT NULL THEN ' — par ' || display ELSE '' END,
    NULLIF(array_to_string(body_parts, ' · '), ''),
    'projects'
  );
  RETURN NEW;
END; $$;

-- TACHE
CREATE OR REPLACE FUNCTION public.notify_on_task_insert() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor TEXT; display TEXT; ch_name TEXT;
  body_parts TEXT[];
BEGIN
  actor := public.auth_email();
  display := public.current_actor_display();
  ch_name := public.chantier_name(NEW.chantier_id);
  body_parts := ARRAY[]::TEXT[];
  IF NEW.priorite  IS NOT NULL AND NEW.priorite  <> '' THEN body_parts := body_parts || NEW.priorite; END IF;
  IF NEW.lot       IS NOT NULL AND NEW.lot       <> '' THEN body_parts := body_parts || ('Lot : ' || NEW.lot); END IF;
  IF NEW.echeance  IS NOT NULL                          THEN body_parts := body_parts || ('Échéance : ' || to_char(NEW.echeance, 'DD/MM')); END IF;
  IF NEW.statut    IS NOT NULL AND NEW.statut    <> '' THEN body_parts := body_parts || ('Statut : ' || NEW.statut); END IF;

  PERFORM public.create_activity_notification(
    'task', NEW.id, NEW.chantier_id, actor,
    'Tâche « ' || COALESCE(NEW.titre, '—') || ' » ajoutée'
      || CASE WHEN ch_name IS NOT NULL THEN ' sur ' || ch_name ELSE '' END
      || CASE WHEN display IS NOT NULL THEN ' — par ' || display ELSE '' END,
    NULLIF(array_to_string(body_parts, ' · '), ''),
    'tasks'
  );
  RETURN NEW;
END; $$;

-- COMPTE RENDU
CREATE OR REPLACE FUNCTION public.notify_on_cr_insert() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor TEXT; display TEXT; ch_name TEXT;
  body_parts TEXT[];
BEGIN
  actor := public.auth_email();
  display := public.current_actor_display();
  ch_name := public.chantier_name(NEW.chantier_id);
  body_parts := ARRAY[]::TEXT[];
  IF NEW.date         IS NOT NULL THEN body_parts := body_parts || ('Date : ' || to_char(NEW.date, 'DD/MM')); END IF;
  IF NEW.participants IS NOT NULL AND NEW.participants <> '' THEN body_parts := body_parts || ('Participants : ' || left(NEW.participants, 80)); END IF;
  IF NEW.resume       IS NOT NULL AND NEW.resume       <> '' THEN body_parts := body_parts || left(NEW.resume, 120); END IF;

  PERFORM public.create_activity_notification(
    'cr', NEW.id, NEW.chantier_id, actor,
    'Compte rendu n°' || COALESCE(NEW.numero::TEXT, '') || ' ajouté'
      || CASE WHEN ch_name IS NOT NULL THEN ' sur ' || ch_name ELSE '' END
      || CASE WHEN display IS NOT NULL THEN ' — par ' || display ELSE '' END,
    NULLIF(array_to_string(body_parts, ' · '), ''),
    'reports'
  );
  RETURN NEW;
END; $$;

-- ORDRE DE SERVICE
CREATE OR REPLACE FUNCTION public.notify_on_os_insert() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor TEXT; display TEXT; ch_name TEXT;
  body_parts TEXT[];
BEGIN
  actor := public.auth_email();
  display := public.current_actor_display();
  ch_name := public.chantier_name(NEW.chantier_id);
  body_parts := ARRAY[]::TEXT[];
  IF NEW.artisan_nom       IS NOT NULL AND NEW.artisan_nom <> '' THEN body_parts := body_parts || ('Artisan : ' || NEW.artisan_nom); END IF;
  IF NEW.montant_ttc       IS NOT NULL AND NEW.montant_ttc > 0  THEN body_parts := body_parts || ('Montant TTC : ' || public.fmt_money(NEW.montant_ttc)); END IF;
  IF NEW.statut            IS NOT NULL AND NEW.statut     <> '' THEN body_parts := body_parts || ('Statut : ' || NEW.statut); END IF;
  IF NEW.date_intervention IS NOT NULL                            THEN body_parts := body_parts || ('Intervention : ' || to_char(NEW.date_intervention, 'DD/MM')); END IF;

  PERFORM public.create_activity_notification(
    'os', NEW.id, NEW.chantier_id, actor,
    'OS ' || COALESCE(NEW.numero, '') || ' ajouté'
      || CASE WHEN ch_name IS NOT NULL THEN ' sur ' || ch_name ELSE '' END
      || CASE WHEN display IS NOT NULL THEN ' — par ' || display ELSE '' END,
    NULLIF(array_to_string(body_parts, ' · '), ''),
    'os'
  );
  RETURN NEW;
END; $$;

-- PIECE JOINTE
CREATE OR REPLACE FUNCTION public.notify_on_attachment_insert() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor TEXT; display TEXT; ch_id UUID; ch_name TEXT;
  body_parts TEXT[];
BEGIN
  actor := public.auth_email();
  display := public.current_actor_display();

  -- Résout le chantier parent (selon quel FK est rempli)
  IF NEW.chantier_id IS NOT NULL THEN
    ch_id := NEW.chantier_id;
  ELSIF NEW.os_id IS NOT NULL THEN
    SELECT chantier_id INTO ch_id FROM ordres_service WHERE id = NEW.os_id;
  ELSIF NEW.cr_id IS NOT NULL THEN
    SELECT chantier_id INTO ch_id FROM compte_rendus WHERE id = NEW.cr_id;
  ELSIF NEW.task_id IS NOT NULL THEN
    SELECT chantier_id INTO ch_id FROM taches WHERE id = NEW.task_id;
  END IF;
  ch_name := public.chantier_name(ch_id);

  body_parts := ARRAY[]::TEXT[];
  IF NEW.file_type IS NOT NULL AND NEW.file_type <> '' THEN body_parts := body_parts || NEW.file_type; END IF;
  IF NEW.file_size IS NOT NULL AND NEW.file_size > 0   THEN
    body_parts := body_parts || CASE
      WHEN NEW.file_size < 1024 THEN NEW.file_size::TEXT || ' o'
      WHEN NEW.file_size < 1048576 THEN round(NEW.file_size / 1024.0)::TEXT || ' Ko'
      ELSE round(NEW.file_size / 1048576.0, 1)::TEXT || ' Mo'
    END;
  END IF;

  PERFORM public.create_activity_notification(
    'attachment', NEW.id, ch_id, actor,
    'Pièce jointe « ' || COALESCE(NEW.file_name, '—') || ' » ajoutée'
      || CASE WHEN ch_name IS NOT NULL THEN ' sur ' || ch_name ELSE '' END
      || CASE WHEN display IS NOT NULL THEN ' — par ' || display ELSE '' END,
    NULLIF(array_to_string(body_parts, ' · '), ''),
    'projects'
  );
  RETURN NEW;
END; $$;

-- ─── ATTACHE LES TRIGGERS ──────────────────────────────────────────
DROP TRIGGER IF EXISTS chantiers_notify_after_insert        ON chantiers;
DROP TRIGGER IF EXISTS taches_notify_after_insert           ON taches;
DROP TRIGGER IF EXISTS compte_rendus_notify_after_insert    ON compte_rendus;
DROP TRIGGER IF EXISTS ordres_service_notify_after_insert   ON ordres_service;
DROP TRIGGER IF EXISTS attachments_notify_after_insert      ON attachments;

CREATE TRIGGER chantiers_notify_after_insert
  AFTER INSERT ON chantiers
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_chantier_insert();

CREATE TRIGGER taches_notify_after_insert
  AFTER INSERT ON taches
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_task_insert();

CREATE TRIGGER compte_rendus_notify_after_insert
  AFTER INSERT ON compte_rendus
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_cr_insert();

CREATE TRIGGER ordres_service_notify_after_insert
  AFTER INSERT ON ordres_service
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_os_insert();

CREATE TRIGGER attachments_notify_after_insert
  AFTER INSERT ON attachments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_attachment_insert();

COMMIT;
