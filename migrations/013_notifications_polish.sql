-- ══════════════════════════════════════════════════════════════
-- MIGRATION 013 — Notifications : polish du contenu
-- ══════════════════════════════════════════════════════════════
-- Corrections :
--   1. fmt_money : "350 000 €" (espace) au lieu de "350,000 €" (virgule)
--   2. current_actor_display : fallback "via Odoo Sign" si aucune session
--      user (cas de la sync automatique avec service role)
--   3. notify_on_os_update : si SEULE la signature a changé, on utilise
--      entity_type='signature' (icône ✍) et un titre court : "OS X — Signé"
-- ══════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. fmt_money avec espace comme séparateur (norme FR) ──────────
CREATE OR REPLACE FUNCTION public.fmt_money(v NUMERIC) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN v IS NULL THEN NULL
    ELSE regexp_replace(to_char(round(v), 'FM999999999999'), '(\d)(?=(\d{3})+$)', '\1 ', 'g') || ' €'
  END
$$;

-- ─── 2. current_actor_display avec fallback explicite ──────────────
CREATE OR REPLACE FUNCTION public.current_actor_display() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT NULLIF(trim(COALESCE(prenom, '') || ' ' || COALESCE(nom, '')), '')
              || CASE WHEN role IS NOT NULL THEN ' (' || role || ')' ELSE '' END
       FROM authorized_users
      WHERE lower(trim(email)) = public.auth_email()
      LIMIT 1),
    NULLIF(split_part(public.auth_email(), '@', 1), ''),
    'via Odoo Sign'
  )
$$;

-- ─── 3. OS update — cas spécial signature ──────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_os_update() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor TEXT; display TEXT; ch_name TEXT;
  body_parts TEXT[];
  only_signature BOOLEAN;
BEGIN
  actor := public.auth_email();
  display := public.current_actor_display();
  ch_name := public.chantier_name(NEW.chantier_id);

  -- Détecte si SEULE la signature a changé (UPDATE déclenché par la sync Odoo)
  only_signature := (NEW.statut_signature IS DISTINCT FROM OLD.statut_signature)
    AND (NEW.statut IS NOT DISTINCT FROM OLD.statut)
    AND (NEW.montant_ttc IS NOT DISTINCT FROM OLD.montant_ttc)
    AND (NEW.artisan_nom IS NOT DISTINCT FROM OLD.artisan_nom)
    AND (NEW.numero IS NOT DISTINCT FROM OLD.numero);

  IF only_signature THEN
    -- Cas spécifique : notif "signature" (entity_type='signature' → icône ✍ côté UI)
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

  -- Cas général : "OS X modifié"
  body_parts := ARRAY[]::TEXT[];
  IF NEW.statut_signature IS DISTINCT FROM OLD.statut_signature THEN
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
    'OS ' || COALESCE(NEW.numero, '') || ' modifié'
      || CASE WHEN ch_name IS NOT NULL THEN ' sur ' || ch_name ELSE '' END
      || CASE WHEN display IS NOT NULL THEN ' — par ' || display ELSE '' END,
    array_to_string(body_parts, ' · '),
    'os'
  );
  RETURN NEW;
END; $$;

COMMIT;
