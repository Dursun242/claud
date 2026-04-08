-- Migration : ajout colonnes photo_couverture et notes_internes sur chantiers
-- À exécuter dans Supabase Dashboard → SQL Editor

ALTER TABLE chantiers
  ADD COLUMN IF NOT EXISTS photo_couverture text,
  ADD COLUMN IF NOT EXISTS notes_internes   text;
