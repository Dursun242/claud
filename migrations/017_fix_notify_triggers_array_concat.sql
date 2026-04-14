-- ══════════════════════════════════════════════════════════════
-- MIGRATION 017 — Fix triggers notify_on_*_update (array concat bug)
-- ══════════════════════════════════════════════════════════════
-- Les fonctions des migrations 012/013 utilisaient la syntaxe
--   body_parts := body_parts || 'Texte';
-- Postgres essayait parfois de parser 'Texte' comme un array literal
-- quand body_parts était encore vide, provoquant :
--   ERROR 22P02: malformed array literal: "Infos mises à jour"
--
-- Fix : remplacer par array_append(body_parts, 'Texte') qui est
-- explicite et toujours bien typé.
-- ══════════════════════════════════════════════════════════════

BEGIN;

-- ─── CHANTIER update ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_chantier_update() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor TEXT; display TEXT;
  body_parts TEXT[] := ARRAY[]::TEXT[];
BEGIN
  actor := public.auth_email();
  display := public.current_actor_display();
  IF NEW.phase IS DISTINCT FROM OLD.phase THEN
    body_parts := array_append(body_parts, 'Phase : ' || COALESCE(OLD.phase,'—') || ' → ' || COALESCE(NEW.phase,'—'));
  END IF;
  IF NEW.statut IS DISTINCT FROM OLD.statut THEN
    body_parts := array_append(body_parts, 'Statut : ' || COALESCE(OLD.statut,'—') || ' → ' || COALESCE(NEW.statut,'—'));
  END IF;
  IF NEW.budget IS DISTINCT FROM OLD.budget THEN
    body_parts := array_append(body_parts, 'Budget : ' || public.fmt_money(NEW.budget));
  END IF;
  IF NEW.depenses IS DISTINCT FROM OLD.depenses THEN
    body_parts := array_append(body_parts, 'Dépenses : ' || public.fmt_money(NEW.depenses));
  END IF;
  IF array_length(body_parts, 1) IS NULL THEN
    body_parts := array_append(body_parts, 'Infos mises à jour');
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

-- ─── TACHE update ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_task_update() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor TEXT; display TEXT; ch_name TEXT;
  body_parts TEXT[] := ARRAY[]::TEXT[];
BEGIN
  actor := public.auth_email();
  display := public.current_actor_display();
  ch_name := public.chantier_name(NEW.chantier_id);
  IF NEW.statut IS DISTINCT FROM OLD.statut THEN
    body_parts := array_append(body_parts, 'Statut : ' || COALESCE(OLD.statut,'—') || ' → ' || COALESCE(NEW.statut,'—'));
  END IF;
  IF NEW.priorite IS DISTINCT FROM OLD.priorite THEN
    body_parts := array_append(body_parts, 'Priorité : ' || COALESCE(OLD.priorite,'—') || ' → ' || COALESCE(NEW.priorite,'—'));
  END IF;
  IF NEW.echeance IS DISTINCT FROM OLD.echeance THEN
    body_parts := array_append(body_parts, 'Échéance : ' || COALESCE(to_char(NEW.echeance, 'DD/MM'), '—'));
  END IF;
  IF NEW.titre IS DISTINCT FROM OLD.titre THEN
    body_parts := array_append(body_parts, 'Titre modifié');
  END IF;
  IF array_length(body_parts, 1) IS NULL THEN
    body_parts := array_append(body_parts, 'Infos mises à jour');
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

-- ─── OS update (cas signature isolé) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_os_update() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor TEXT; display TEXT; ch_name TEXT;
  body_parts TEXT[] := ARRAY[]::TEXT[];
  only_signature BOOLEAN;
  title_suffix TEXT := 'modifié';
BEGIN
  actor := public.auth_email();
  display := public.current_actor_display();
  ch_name := public.chantier_name(NEW.chantier_id);

  only_signature := (NEW.statut_signature IS DISTINCT FROM OLD.statut_signature)
    AND (NEW.statut IS NOT DISTINCT FROM OLD.statut)
    AND (NEW.montant_ttc IS NOT DISTINCT FROM OLD.montant_ttc)
    AND (NEW.artisan_nom IS NOT DISTINCT FROM OLD.artisan_nom)
    AND (NEW.numero IS NOT DISTINCT FROM OLD.numero);

  IF only_signature THEN
    PERFORM public.create_activity_notification_ex(
      'update', 'signature', NEW.id, NEW.chantier_id, actor,
      'OS ' || COALESCE(NEW.numero, '') || ' — ' || COALESCE(NEW.statut_signature, 'signature')
        || CASE WHEN ch_name IS NOT NULL THEN ' · ' || ch_name ELSE '' END
        || CASE WHEN display IS NOT NULL THEN ' — ' || display ELSE '' END,
      'Signature : ' || COALESCE(OLD.statut_signature, '—') || ' → ' || COALESCE(NEW.statut_signature, '—'),
      'os'
    );
    RETURN NEW;
  END IF;

  IF NEW.statut_signature IS DISTINCT FROM OLD.statut_signature THEN
    body_parts := array_append(body_parts, 'Signature : ' || COALESCE(OLD.statut_signature,'—') || ' → ' || COALESCE(NEW.statut_signature,'—'));
  END IF;
  IF NEW.statut IS DISTINCT FROM OLD.statut THEN
    body_parts := array_append(body_parts, 'Statut : ' || COALESCE(OLD.statut,'—') || ' → ' || COALESCE(NEW.statut,'—'));
    title_suffix := 'statut : ' || COALESCE(NEW.statut, '—');
  END IF;
  IF NEW.montant_ttc IS DISTINCT FROM OLD.montant_ttc THEN
    body_parts := array_append(body_parts, 'Montant TTC : ' || public.fmt_money(NEW.montant_ttc));
  END IF;
  IF NEW.artisan_nom IS DISTINCT FROM OLD.artisan_nom THEN
    body_parts := array_append(body_parts, 'Artisan : ' || COALESCE(NEW.artisan_nom, '—'));
  END IF;
  IF array_length(body_parts, 1) IS NULL THEN
    body_parts := array_append(body_parts, 'Infos mises à jour');
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

COMMIT;
