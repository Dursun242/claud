-- ══════════════════════════════════════════════════════════════
-- MIGRATION 006a — TABLE activity_logs (1/3)
-- ══════════════════════════════════════════════════════════════
-- Version mobile-friendly : à coller/exécuter en 3 étapes
-- (006a → 006b → 006c) depuis le SQL Editor Supabase sur iOS/Safari
-- où les longs copier-coller sont tronqués.
-- Étape 1/3 : création de la table et des index.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_email    TEXT,
  user_prenom   TEXT,
  user_role     TEXT,
  action        TEXT NOT NULL,
  entity_type   TEXT,
  entity_id     TEXT,
  entity_label  TEXT,
  metadata      JSONB,
  user_agent    TEXT
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_email ON public.activity_logs (user_email);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action     ON public.activity_logs (action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity     ON public.activity_logs (entity_type, entity_id);
