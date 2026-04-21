# Migration 021 — Storage RLS granulaire

## Pourquoi

La RLS actuelle du bucket `attachments` (`fix-storage-rls-policies.sql`) n'a qu'une condition :

```sql
USING (bucket_id = 'attachments')
```

Conséquence : **n'importe quel utilisateur authentifié** peut lire / supprimer / uploader sur le bucket, tant qu'il a un JWT valide. Un MOA qui devine ou apprend l'URL d'un fichier appartenant à un autre chantier peut y accéder directement via l'API Storage (contournant la RLS de la table `attachments`).

Impact réel : scénario multi-tenant → fuite de documents entre clients.

## Ce que fait la migration

- **SELECT / DELETE / UPDATE** : lie la policy à l'existence d'une ligne `attachments` visible (la RLS de la table filtre déjà par chantier). Plus de fuite par URL devinée.
- **INSERT** : impose le préfixe `(chantier|os|cr|task)/<uuid>/…` pour empêcher l'injection de paths arbitraires.
- **Index** `idx_attachments_file_path` pour que le join storage → attachments reste rapide.

Les routes API qui uploadent via `SUPABASE_SERVICE_ROLE_KEY` (`/api/upload`) **bypassent la RLS** comme avant — aucun changement côté flow serveur.

## Appliquer

```sql
-- Supabase Dashboard → SQL Editor
\i migrations/021_storage_rls_granular.sql
```

## Vérifier

```sql
-- Liste les policies actuelles sur storage.objects :
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects';

-- Doit afficher :
--   attachments_select_granular   | SELECT
--   attachments_insert_prefixed   | INSERT
--   attachments_delete_granular   | DELETE
--   attachments_update_granular   | UPDATE
```

## Test manuel (optionnel)

En tant que MOA A (chantier A) :
1. Lister ses PJ → OK
2. Deviner un `file_path` d'un chantier B → **doit échouer** avec `RLS` (avant : renvoyait le fichier)

## Rollback

Voir la section en bas du fichier SQL. Recrée les 3 policies « wide open » initiales.
