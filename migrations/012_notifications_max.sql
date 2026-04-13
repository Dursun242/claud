-- ══════════════════════════════════════════════════════════════
-- MIGRATION 012 — Notifications maximum : UPDATE, DELETE, commentaires
-- ══════════════════════════════════════════════════════════════
-- Étend la couverture des notifications à tous les événements métier :
--   - INSERT déjà couvert par migration 011 (chantiers, taches, CR, OS, PJ)
--   - UPDATE sur les 5 mêmes tables (+ statut_signature pour OS)
--   - DELETE sur les 5 mêmes tables
--   - INSERT sur comments (nouveau commentaire)
--
-- Note : UPDATE sur TOUTE modif peut générer beaucoup de notifs. On
-- accepte le bruit volontairement, c'est le choix métier. Les champs
-- critiques (statut, phase, signature) sont explicités dans le body.
-- ══════════════════════════════════════════════════════════════

BEGIN;

-- ─── Helper générique pour action update / delete ──────────────────
-- On factorise un seul create_activity_notification déjà créé en 011,
-- mais on doit passer explicitement kind ('update' | 'delete'). On ajoute
-- une variante qui accepte kind en paramètre.
CREATE OR REPLACE FUNCTION public.create_activity_notification_ex(
  p_kind        TEXT,
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
    VALUES (r.email, p_actor_email, p_kind, p_entity_type, p_entity_id, p_chantier_id, p_title, p_body, p_target_tab);
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
        VALUES (r.email, p_actor_email, p_kind, p_entity_type, p_entity_id, p_chantier_id, p_title, p_body, p_target_tab);
      END LOOP;
    END IF;
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- UPDATE TRIGGERS
-- ═══════════════════════════════════════════════════════════════════

-- CHANTIER update
CREATE OR REPLACE FUNCTION public.notify_on_chantier_update() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor TEXT; display TEXT;
  body_parts TEXT[];
BEGIN
  actor := public.auth_email();
  display := public.current_actor_display();
  body_parts := ARRAY[]::TEXT[];
  IF NEW.phase IS DISTINCT FROM OLD.phase THEN
    body_parts := body_parts || ('Phase : ' || COALESCE(OLD.phase,'—') || ' → ' || COALESCE(NEW.phase,'—'));
  END IF;
  IF NEW.statut IS DISTINCT FROM OLD.statut THEN
    body_parts := body_parts || ('Statut : ' || COALESCE(OLD.statut,'—') || ' → ' || COALESCE(NEW.statut,'—'));
  END IF;
  IF NEW.budget IS DISTINCT FROM OLD.budget THEN
    body_parts := body_parts || ('Budget : ' || public.fmt_money(NEW.budget));
  END IF;
  IF NEW.depenses IS DISTINCT FROM OLD.depenses THEN
    body_parts := body_parts || ('Dépenses : ' || public.fmt_money(NEW.depenses));
  END IF;
  IF array_length(body_parts, 1) IS NULL THEN
    body_parts := body_parts || 'Infos mises à jour';
  END IF;

  PERFORM public.create_activity_notification_ex(
    'update', 'chantier', NEW.id, NEW.id, actor,
    'Chantier ' || COALESCE(NEW.nom, '—') || ' modifié'
      || CASE WHEN display IS NOT NULL THEN ' — par ' || display ELSE '' END,
    array_to_string(body_parts, ' · '),
    'projects'
  );
  RETURN NEW;
END; $$;

-- TACHE update
CREATE OR REPLACE FUNCTION public.notify_on_task_update() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor TEXT; display TEXT; ch_name TEXT;
  body_parts TEXT[];
BEGIN
  actor := public.auth_email();
  display := public.current_actor_display();
  ch_name := public.chantier_name(NEW.chantier_id);
  body_parts := ARRAY[]::TEXT[];
  IF NEW.statut IS DISTINCT FROM OLD.statut THEN
    body_parts := body_parts || ('Statut : ' || COALESCE(OLD.statut,'—') || ' → ' || COALESCE(NEW.statut,'—'));
  END IF;
  IF NEW.priorite IS DISTINCT FROM OLD.priorite THEN
    body_parts := body_parts || ('Priorité : ' || COALESCE(OLD.priorite,'—') || ' → ' || COALESCE(NEW.priorite,'—'));
  END IF;
  IF NEW.echeance IS DISTINCT FROM OLD.echeance THEN
    body_parts := body_parts || ('Échéance : ' || COALESCE(to_char(NEW.echeance, 'DD/MM'), '—'));
  END IF;
  IF NEW.titre IS DISTINCT FROM OLD.titre THEN
    body_parts := body_parts || ('Titre modifié');
  END IF;
  IF array_length(body_parts, 1) IS NULL THEN
    body_parts := body_parts || 'Infos mises à jour';
  END IF;

  PERFORM public.create_activity_notification_ex(
    'update', 'task', NEW.id, NEW.chantier_id, actor,
    'Tâche « ' || COALESCE(NEW.titre, '—') || ' » modifiée'
      || CASE WHEN ch_name IS NOT NULL THEN ' sur ' || ch_name ELSE '' END
      || CASE WHEN display IS NOT NULL THEN ' — par ' || display ELSE '' END,
    array_to_string(body_parts, ' · '),
    'tasks'
  );
  RETURN NEW;
END; $$;

-- CR update
CREATE OR REPLACE FUNCTION public.notify_on_cr_update() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor TEXT; display TEXT; ch_name TEXT;
BEGIN
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

-- OS update
CREATE OR REPLACE FUNCTION public.notify_on_os_update() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor TEXT; display TEXT; ch_name TEXT;
  body_parts TEXT[];
  title_suffix TEXT := 'modifié';
BEGIN
  actor := public.auth_email();
  display := public.current_actor_display();
  ch_name := public.chantier_name(NEW.chantier_id);
  body_parts := ARRAY[]::TEXT[];

  -- Signature : on met en avant si elle a changé
  IF NEW.statut_signature IS DISTINCT FROM OLD.statut_signature THEN
    title_suffix := 'signature : ' || COALESCE(NEW.statut_signature, '—');
    body_parts := body_parts || ('Signature : ' || COALESCE(OLD.statut_signature,'—') || ' → ' || COALESCE(NEW.statut_signature,'—'));
  END IF;
  IF NEW.statut IS DISTINCT FROM OLD.statut THEN
    body_parts := body_parts || ('Statut : ' || COALESCE(OLD.statut,'—') || ' → ' || COALESCE(NEW.statut,'—'));
  END IF;
  IF NEW.montant_ttc IS DISTINCT FROM OLD.montant_ttc THEN
    body_parts := body_parts || ('Montant TTC : ' || public.fmt_money(NEW.montant_ttc));
  END IF;
  IF NEW.artisan_nom IS DISTINCT FROM OLD.artisan_nom THEN
    body_parts := body_parts || ('Artisan : ' || COALESCE(NEW.artisan_nom, '—'));
  END IF;
  IF array_length(body_parts, 1) IS NULL THEN
    body_parts := body_parts || 'Infos mises à jour';
  END IF;

  PERFORM public.create_activity_notification_ex(
    'update', 'os', NEW.id, NEW.chantier_id, actor,
    'OS ' || COALESCE(NEW.numero, '') || ' ' || title_suffix
      || CASE WHEN ch_name IS NOT NULL THEN ' sur ' || ch_name ELSE '' END
      || CASE WHEN display IS NOT NULL THEN ' — par ' || display ELSE '' END,
    array_to_string(body_parts, ' · '),
    'os'
  );
  RETURN NEW;
END; $$;

-- ═══════════════════════════════════════════════════════════════════
-- DELETE TRIGGERS
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.notify_on_chantier_delete() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor TEXT; display TEXT;
BEGIN
  actor := public.auth_email();
  display := public.current_actor_display();
  PERFORM public.create_activity_notification_ex(
    'delete', 'chantier', OLD.id, NULL, actor,
    'Chantier « ' || COALESCE(OLD.nom, '—') || ' » supprimé'
      || CASE WHEN display IS NOT NULL THEN ' — par ' || display ELSE '' END,
    NULL, 'projects'
  );
  RETURN OLD;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_on_task_delete() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor TEXT; display TEXT; ch_name TEXT;
BEGIN
  actor := public.auth_email();
  display := public.current_actor_display();
  ch_name := public.chantier_name(OLD.chantier_id);
  PERFORM public.create_activity_notification_ex(
    'delete', 'task', OLD.id, OLD.chantier_id, actor,
    'Tâche « ' || COALESCE(OLD.titre, '—') || ' » supprimée'
      || CASE WHEN ch_name IS NOT NULL THEN ' sur ' || ch_name ELSE '' END
      || CASE WHEN display IS NOT NULL THEN ' — par ' || display ELSE '' END,
    NULL, 'tasks'
  );
  RETURN OLD;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_on_cr_delete() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor TEXT; display TEXT; ch_name TEXT;
BEGIN
  actor := public.auth_email();
  display := public.current_actor_display();
  ch_name := public.chantier_name(OLD.chantier_id);
  PERFORM public.create_activity_notification_ex(
    'delete', 'cr', OLD.id, OLD.chantier_id, actor,
    'Compte rendu n°' || COALESCE(OLD.numero::TEXT, '') || ' supprimé'
      || CASE WHEN ch_name IS NOT NULL THEN ' sur ' || ch_name ELSE '' END
      || CASE WHEN display IS NOT NULL THEN ' — par ' || display ELSE '' END,
    NULL, 'reports'
  );
  RETURN OLD;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_on_os_delete() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor TEXT; display TEXT; ch_name TEXT;
BEGIN
  actor := public.auth_email();
  display := public.current_actor_display();
  ch_name := public.chantier_name(OLD.chantier_id);
  PERFORM public.create_activity_notification_ex(
    'delete', 'os', OLD.id, OLD.chantier_id, actor,
    'OS ' || COALESCE(OLD.numero, '') || ' supprimé'
      || CASE WHEN ch_name IS NOT NULL THEN ' sur ' || ch_name ELSE '' END
      || CASE WHEN display IS NOT NULL THEN ' — par ' || display ELSE '' END,
    NULL, 'os'
  );
  RETURN OLD;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_on_attachment_delete() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor TEXT; display TEXT; ch_id UUID; ch_name TEXT;
BEGIN
  actor := public.auth_email();
  display := public.current_actor_display();
  IF OLD.chantier_id IS NOT NULL THEN ch_id := OLD.chantier_id;
  ELSIF OLD.os_id IS NOT NULL THEN SELECT chantier_id INTO ch_id FROM ordres_service WHERE id = OLD.os_id;
  ELSIF OLD.cr_id IS NOT NULL THEN SELECT chantier_id INTO ch_id FROM compte_rendus WHERE id = OLD.cr_id;
  ELSIF OLD.task_id IS NOT NULL THEN SELECT chantier_id INTO ch_id FROM taches WHERE id = OLD.task_id;
  END IF;
  ch_name := public.chantier_name(ch_id);
  PERFORM public.create_activity_notification_ex(
    'delete', 'attachment', OLD.id, ch_id, actor,
    'Pièce jointe « ' || COALESCE(OLD.file_name, '—') || ' » supprimée'
      || CASE WHEN ch_name IS NOT NULL THEN ' sur ' || ch_name ELSE '' END
      || CASE WHEN display IS NOT NULL THEN ' — par ' || display ELSE '' END,
    NULL, 'projects'
  );
  RETURN OLD;
END; $$;

-- ═══════════════════════════════════════════════════════════════════
-- COMMENTS INSERT
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.notify_on_comment_insert() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor TEXT; display TEXT; ch_id UUID; ch_name TEXT;
  parent_label TEXT;
BEGIN
  actor := public.auth_email();
  display := public.current_actor_display();

  -- Résout le chantier parent selon quel FK est rempli
  IF NEW.chantier_id IS NOT NULL THEN
    ch_id := NEW.chantier_id;
    parent_label := 'le chantier';
  ELSIF NEW.os_id IS NOT NULL THEN
    SELECT chantier_id INTO ch_id FROM ordres_service WHERE id = NEW.os_id;
    parent_label := 'un ordre de service';
  ELSIF NEW.cr_id IS NOT NULL THEN
    SELECT chantier_id INTO ch_id FROM compte_rendus WHERE id = NEW.cr_id;
    parent_label := 'un compte rendu';
  ELSIF NEW.task_id IS NOT NULL THEN
    SELECT chantier_id INTO ch_id FROM taches WHERE id = NEW.task_id;
    parent_label := 'une tâche';
  ELSE
    parent_label := 'un élément';
  END IF;
  ch_name := public.chantier_name(ch_id);

  PERFORM public.create_activity_notification_ex(
    'create', 'comment', NEW.id, ch_id, actor,
    'Nouveau commentaire sur ' || parent_label
      || CASE WHEN ch_name IS NOT NULL THEN ' (' || ch_name || ')' ELSE '' END
      || CASE WHEN display IS NOT NULL THEN ' — par ' || display ELSE '' END,
    left(COALESCE(NEW.content, ''), 140),
    'projects'
  );
  RETURN NEW;
END; $$;

-- ─── ATTACHE LES NOUVEAUX TRIGGERS ────────────────────────────────
DROP TRIGGER IF EXISTS chantiers_notify_after_update      ON chantiers;
DROP TRIGGER IF EXISTS chantiers_notify_after_delete      ON chantiers;
DROP TRIGGER IF EXISTS taches_notify_after_update         ON taches;
DROP TRIGGER IF EXISTS taches_notify_after_delete         ON taches;
DROP TRIGGER IF EXISTS compte_rendus_notify_after_update  ON compte_rendus;
DROP TRIGGER IF EXISTS compte_rendus_notify_after_delete  ON compte_rendus;
DROP TRIGGER IF EXISTS ordres_service_notify_after_update ON ordres_service;
DROP TRIGGER IF EXISTS ordres_service_notify_after_delete ON ordres_service;
DROP TRIGGER IF EXISTS attachments_notify_after_delete    ON attachments;
DROP TRIGGER IF EXISTS comments_notify_after_insert       ON comments;

CREATE TRIGGER chantiers_notify_after_update
  AFTER UPDATE ON chantiers
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_chantier_update();

CREATE TRIGGER chantiers_notify_after_delete
  AFTER DELETE ON chantiers
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_chantier_delete();

CREATE TRIGGER taches_notify_after_update
  AFTER UPDATE ON taches
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_task_update();

CREATE TRIGGER taches_notify_after_delete
  AFTER DELETE ON taches
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_task_delete();

CREATE TRIGGER compte_rendus_notify_after_update
  AFTER UPDATE ON compte_rendus
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_cr_update();

CREATE TRIGGER compte_rendus_notify_after_delete
  AFTER DELETE ON compte_rendus
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_cr_delete();

CREATE TRIGGER ordres_service_notify_after_update
  AFTER UPDATE ON ordres_service
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_os_update();

CREATE TRIGGER ordres_service_notify_after_delete
  AFTER DELETE ON ordres_service
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_os_delete();

CREATE TRIGGER attachments_notify_after_delete
  AFTER DELETE ON attachments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_attachment_delete();

CREATE TRIGGER comments_notify_after_insert
  AFTER INSERT ON comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment_insert();

COMMIT;
