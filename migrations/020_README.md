# Migration 020 — RPC `chantier_attachment_counts`

## Pourquoi

Avant : `SB.loadSecondary()` faisait un `SELECT id, chantier_id FROM attachments` limité à 1 000 lignes pour alimenter le compteur « N PJ » par chantier sur la liste Chantiers.

Inconvénients :
- **Bande passante** : sur un compte mature, c'est jusqu'à ~80 kB de JSON téléchargés à chaque démarrage, pour un simple compteur.
- **Exactitude** : le cap de 1 000 rendait le compteur faux si plus d'attachments existaient.
- **Temps** : le scan `order by created_at desc` force la lecture (même indexée) de N lignes.

Après : une fonction Postgres `chantier_attachment_counts()` renvoie **une ligne par chantier** avec le `COUNT(*)` — ≈50-200 lignes max.

## Appliquer

```sql
-- Via le SQL Editor Supabase (Dashboard → SQL):
\i migrations/020_chantier_counts_rpc.sql
```

## Vérifier

```sql
-- Doit renvoyer qq lignes, une par chantier ayant au moins 1 PJ:
SELECT * FROM chantier_attachment_counts() LIMIT 5;
```

## Sécurité

- `SECURITY INVOKER` : la fonction tourne avec les droits du caller, les RLS de `attachments` s'appliquent. Un MOA ne voit que les counts de ses chantiers.
- `GRANT EXECUTE` sur `anon, authenticated` : idem que toutes les autres routes Supabase.

## Rollback

```sql
DROP FUNCTION IF EXISTS public.chantier_attachment_counts();
DROP INDEX IF EXISTS idx_attachments_chantier_id;
```

Le code JS (`SB.loadSecondary`) a un fallback silencieux : si la fonction n'existe pas encore (avant application de la migration), il skippe proprement et les compteurs affichent 0. Pas de crash, juste une feature temporairement dégradée.
