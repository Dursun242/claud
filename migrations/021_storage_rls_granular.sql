-- ══════════════════════════════════════════════════════════════
-- MIGRATION 021 — Storage RLS granulaire par attachment
-- ══════════════════════════════════════════════════════════════
--
-- CONTEXTE
--
-- La policy actuelle (fix-storage-rls-policies.sql) autorise tout
-- utilisateur AUTHENTIFIÉ à lire / insérer / supprimer n'importe quel
-- fichier du bucket `attachments` :
--
--   CREATE POLICY "authenticated_read_attachments"
--     ON storage.objects FOR SELECT TO authenticated
--     USING (bucket_id = 'attachments');
--
-- Conséquence : un MOA authentifié qui devine ou apprend l'URL d'un
-- fichier d'un AUTRE chantier peut y accéder. RLS de la table
-- `attachments` filtre bien ce qui est VISIBLE via la DB (il ne voit
-- pas les file_path des autres), mais rien n'empêche un accès direct
-- via Storage API avec un path deviné.
--
-- APPROCHE
--
-- Pour SELECT / DELETE / UPDATE : on lie la policy à l'existence d'une
-- ligne `attachments.file_path = storage.objects.name`. Comme la table
-- `attachments` a elle-même sa RLS (chantier via RLS canonique
-- migration 005), le `EXISTS (...)` ne matche que les lignes VISIBLES
-- par le user. Un attaquant qui devine un path ne peut plus y accéder.
--
-- Pour INSERT : le path vient de l'utilisateur AVANT que la ligne
-- `attachments` soit créée. On ne peut pas checker via la DB. On se
-- contente :
--   a) d'exiger authenticated (inchangé),
--   b) d'imposer le préfixe `chantier|os|cr|task/<uuid>/...` pour
--      éviter l'injection de paths arbitraires (ex : `admin/...`).
--
-- Les routes API qui uploadent via service role key (SUPABASE_SERVICE_
-- ROLE_KEY) bypassent la RLS comme avant — rien ne change.
--
-- ROLLBACK : voir en fin de fichier.

BEGIN;

-- ─── 1. Drop des anciennes policies "authenticated_*" ─────────
-- On drop par nom exact (tel qu'écrit dans fix-storage-rls-policies.sql).
-- IF EXISTS pour rester idempotent.
DROP POLICY IF EXISTS "authenticated_read_attachments"   ON storage.objects;
DROP POLICY IF EXISTS "authenticated_insert_attachments" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_delete_attachments" ON storage.objects;

-- ─── 2. SELECT granulaire ─────────────────────────────────────
-- Accès à un objet storage autorisé ssi il existe une ligne
-- `attachments` de même file_path que l'utilisateur peut voir.
-- La RLS de `attachments` (migration 005) se charge du filtrage
-- par chantier / rôle — cette policy en hérite automatiquement.
CREATE POLICY "attachments_select_granular"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'attachments'
    AND EXISTS (
      SELECT 1 FROM public.attachments a
      WHERE a.file_path = storage.objects.name
    )
  );

-- ─── 3. INSERT avec garde-fou de path ─────────────────────────
-- On accepte les 4 racines de type métier suivi d'un UUID valide,
-- puis un path libre. Empêche d'uploader `admin/secret.pdf` ou
-- d'autres paths hors de la convention interne.
--
-- Pattern : ^(chantier|os|cr|task)/[0-9a-fA-F-]{36}/.+
CREATE POLICY "attachments_insert_prefixed"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'attachments'
    AND name ~ '^(chantier|os|cr|task)/[0-9a-fA-F-]{36}/.+'
  );

-- ─── 4. DELETE granulaire ─────────────────────────────────────
-- Même logique que SELECT : on ne peut supprimer un objet storage
-- que si une ligne `attachments` correspondante est visible.
CREATE POLICY "attachments_delete_granular"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'attachments'
    AND EXISTS (
      SELECT 1 FROM public.attachments a
      WHERE a.file_path = storage.objects.name
    )
  );

-- ─── 5. UPDATE (rarissime, idempotent) ────────────────────────
-- Supabase storage déclenche un UPDATE lors d'un upload `upsert: true`.
-- On aligne.
CREATE POLICY "attachments_update_granular"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'attachments'
    AND EXISTS (
      SELECT 1 FROM public.attachments a
      WHERE a.file_path = storage.objects.name
    )
  );

-- ─── 6. Index supportant le join storage → attachments ────────
-- Sans ça, chaque SELECT storage.objects fait un seq scan de
-- `attachments`. Avec ~1000+ attachments sur compte mature, la
-- latence explose.
CREATE INDEX IF NOT EXISTS idx_attachments_file_path
  ON public.attachments (file_path);

COMMIT;

-- ══════════════════════════════════════════════════════════════
-- ROLLBACK (en cas de régression)
-- ══════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP POLICY IF EXISTS "attachments_select_granular" ON storage.objects;
-- DROP POLICY IF EXISTS "attachments_insert_prefixed" ON storage.objects;
-- DROP POLICY IF EXISTS "attachments_delete_granular" ON storage.objects;
-- DROP POLICY IF EXISTS "attachments_update_granular" ON storage.objects;
--
-- CREATE POLICY "authenticated_read_attachments"
--   ON storage.objects FOR SELECT TO authenticated
--   USING (bucket_id = 'attachments');
-- CREATE POLICY "authenticated_insert_attachments"
--   ON storage.objects FOR INSERT TO authenticated
--   WITH CHECK (bucket_id = 'attachments');
-- CREATE POLICY "authenticated_delete_attachments"
--   ON storage.objects FOR DELETE TO authenticated
--   USING (bucket_id = 'attachments');
-- COMMIT;
