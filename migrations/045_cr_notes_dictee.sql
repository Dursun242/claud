-- 045 — Comptes rendus : notes de dictée gardées avec le CR
--
-- Les notes dictées (ou tapées) pendant la réunion étaient perdues à
-- l'enregistrement du CR : à la reprise d'un brouillon, la dictée repartait
-- de zéro. Elles sont maintenant enregistrées avec le CR.
--   - notes_dictee  : texte complet des notes de la réunion
--   - notes_rangees : nombre de caractères déjà rangés par l'IA (seule la
--                     suite est analysée au rangement suivant : rien n'est
--                     ajouté deux fois)
--   - enregistre_le : date du dernier enregistrement (un brouillon resté
--                     sur l'appareil plus récent est repris automatiquement)
-- Idempotent : ré-exécutable sans erreur. À appliquer après 044.

ALTER TABLE public.compte_rendus
  ADD COLUMN IF NOT EXISTS notes_dictee TEXT,
  ADD COLUMN IF NOT EXISTS notes_rangees INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enregistre_le TIMESTAMPTZ;
