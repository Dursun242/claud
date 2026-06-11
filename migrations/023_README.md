# Migration 023 — Suppression des tables mortes

## But

Supprimer 7 tables créées par les migrations 001 et 002, **inutilisées par
l'application** (aucune référence dans `src/`) et porteuses de dette de
sécurité :

| Origine | Tables | Problème |
|---|---|---|
| 001 | `user_roles`, `plans`, `photo_reports`, `photos` | Système de rôles `user_roles` parallèle et concurrent de `authorized_users` (source de confusion RLS) ; tables jamais branchées côté app. |
| 002 | `os_validations`, `cr_commentaires`, `chantier_photos` | Policies `FOR ALL USING (true)` (« Allow all ») : tout utilisateur authentifié pouvait lire/écrire ces tables. |

> La feature « Reportage Photo » (`PhotoReportsV.js`) ne dépend PAS de ces
> tables : elle stocke ses PDF via `/api/upload` dans la table `attachments`.
> Les colonnes ajoutées par 002 à `ordres_service` et `compte_rendus` (feature
> de validation interactive) sont **conservées** — seules les 3 tables annexes
> sont supprimées.

## ⚠️ Vérification pré-exécution

Avant d'exécuter la migration en production, confirmer que les tables sont
vides (l'app ne les ayant jamais alimentées, le résultat attendu est 0 partout) :

```sql
SELECT
  (SELECT count(*) FROM user_roles)      AS user_roles,
  (SELECT count(*) FROM plans)           AS plans,
  (SELECT count(*) FROM photo_reports)   AS photo_reports,
  (SELECT count(*) FROM photos)          AS photos,
  (SELECT count(*) FROM os_validations)  AS os_validations,
  (SELECT count(*) FROM cr_commentaires) AS cr_commentaires,
  (SELECT count(*) FROM chantier_photos) AS chantier_photos;
```

Si une table contient des lignes inattendues, **ne pas exécuter** et investiguer
d'abord (la table est peut-être alimentée par un canal hors `src/`).

Si une table n'existe pas (migration 001/002 partiellement appliquée), la
requête échoue sur le `count` correspondant — c'est sans gravité, la migration
elle-même utilise `DROP TABLE IF EXISTS` et reste idempotente.

## Ce que fait la migration

`DROP TABLE ... CASCADE` sur les 7 tables, ce qui nettoie automatiquement leurs
policies RLS (dont les anciennes policies 004 basées sur `user_roles`,
supplantées par 005), index (006), triggers et contraintes FK.

Puis suppression de 3 fonctions devenues orphelines :
`update_cr_commentaires_timestamp()`, `get_user_role(uuid)`, `is_admin(uuid)`.

> ⚠️ `public.is_admin()` **sans argument** — la fonction canonique de 005
> utilisée par toute la RLS — n'est PAS touchée. Postgres distingue les deux
> par leur signature.

## Impact

- **RLS en place** : aucun changement. Aucune policy canonique de 005 ne
  référence ces tables (vérifié à l'audit).
- **Front** : aucun. Aucun fichier de `src/` ne lit ou n'écrit ces tables.
- **Réversibilité** : destructif. Pas de rollback automatique — restaurer via
  snapshot Supabase si besoin. Les définitions d'origine restent disponibles
  dans `001_refonte_complete.sql` et `002_v3_validation_os_cr_interactif.sql`.
