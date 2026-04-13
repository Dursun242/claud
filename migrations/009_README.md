# Migration 009 — Notifications in-app

## Pourquoi

Le gérant veut que chaque utilisateur (staff + clients) soit averti quand
un nouveau document (chantier, OS, CR, tâche, pièce jointe, commentaire)
est créé sur un chantier qui le concerne.

L'UI affiche les 10 plus récentes dans une cloche 🔔 du topbar, avec
un badge de non-lues.

## Table créée

| Colonne | Type | Description |
|---|---|---|
| `id` | UUID | PK |
| `recipient_email` | TEXT | Destinataire (celui qui verra la notif) |
| `actor_email` | TEXT | Qui a déclenché l'événement |
| `kind` | TEXT | `create` / `update` / `delete` |
| `entity_type` | TEXT | `chantier` / `os` / `cr` / `task` / `attachment` / `comment` |
| `entity_id` | UUID | ID de la ressource |
| `chantier_id` | UUID | Chantier concerné (si applicable) |
| `title` | TEXT | Titre court affiché |
| `body` | TEXT | Complément optionnel |
| `target_tab` | TEXT | Onglet à ouvrir au clic (`projects`/`os`/…) |
| `read_at` | TIMESTAMPTZ | NULL = non lu |
| `created_at` | TIMESTAMPTZ | Date de création |

## RLS

| Policy | Règle |
|---|---|
| SELECT | `recipient_email` = utilisateur courant |
| INSERT | `actor_email` = utilisateur courant OU staff |
| UPDATE | `recipient_email` = utilisateur courant (pour le `read_at`) |
| DELETE | `recipient_email` = utilisateur courant |

## Comment l'appliquer

1. Supabase Dashboard → **SQL Editor**
2. Copier-coller le contenu de `009_notifications.sql`
3. **Run**

Idempotent (DROP POLICY IF EXISTS + CREATE TABLE IF NOT EXISTS).

## Realtime (optionnel mais recommandé)

Pour que les notifs apparaissent en direct sans refresh, activer Realtime
sur la table :

1. Supabase Dashboard → **Database** → **Replication**
2. Activer Realtime pour la table `notifications`

Si tu ne le fais pas, le panneau se rechargera juste à chaque ouverture
du panneau cloche.
