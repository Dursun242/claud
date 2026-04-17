# Ordre d'application des migrations

Exécuter dans cet ordre exact sur une base vierge (Supabase Dashboard → SQL Editor, ou `supabase db execute --file <fichier>`).

## Séquence principale (obligatoire)

| # | Fichier | But |
|---|---|---|
| 001 | `001_refonte_complete.sql` | Schéma de base (chantiers, os, cr, tâches, contacts, planning…) |
| 002 | `002_v3_validation_os_cr_interactif.sql` | Validation interactive OS/CR (v3.0) |
| 003 | `003_create_storage_bucket.sql` | Bucket Storage pour pièces jointes |
| 004 | `004_fix_rls_security.sql` | Premier passage RLS (surchargé par 005) |
| 005 | `005_rls_proper.sql` | **RLS canonique** par rôle (admin / salarié / client). Voir `005_README.md`. |
| 006 | `006_performance_indexes.sql` | Indexes de perf |
| 007 | `007_activity_logs_consolidated.sql` | Audit trail |
| 008 | `008_client_can_manage_tasks.sql` | Permissions tâches côté client |
| 009 | `009_notifications.sql` | Table notifications |
| 010 | `010_authorized_users_select_all.sql` | Lecture users autorisés |
| 011 | `011_notifications_triggers.sql` | Triggers de notifications |
| 012 | `012_notifications_max.sql` | Limite de notifications |
| 013 | `013_notifications_polish.sql` | Ajustements notifications |
| 014 | `014_demo_account.sql` | Compte de démo |
| 015 | `015_demo_chantiers_enriched.sql` | Données démo enrichies |
| 016 | `016_chantier_is_demo_flag.sql` | Flag `is_demo` sur chantier |
| 017 | `017_fix_notify_triggers_array_concat.sql` | Fix triggers notifs |
| 018 | `018_authorized_users_restrict_select.sql` | Durcissement RLS authorized_users |

## Fichiers NON séquentiels (à ne PAS appliquer en séquence)

| Fichier | Statut | Notes |
|---|---|---|
| `005_rls_proper_rollback.sql` | 🚑 Disaster recovery | À n'exécuter que si 005 casse la prod. Restaure l'état "Allow all" **insécurisé**. |
| `add-chantier-photo-notes.sql` | Legacy / ad-hoc | Vérifier si déjà appliqué via schéma avant ré-exécution |
| `add-odoo-sign-to-os.sql` | Legacy / ad-hoc | idem |
| `fix-add-admin-user.sql` | Hotfix ponctuel | idem |
| `fix-create-storage-bucket.sql` | Hotfix ponctuel | idem |
| `fix-storage-rls-policies.sql` | Hotfix ponctuel | idem |

## Migrations externes (hors dossier)

- `/supabase-migration-*.sql` (racine) — anciennes migrations v2. **Ne pas ré-appliquer** si la séquence ci-dessus a tourné.
- `/db-migrations/` — module PV de Réception, isolé du schéma principal.

## Prérequis

Avant d'exécuter **n'importe quelle** migration RLS (004, 005, 018) :

```sql
SELECT email, role, actif FROM authorized_users WHERE role = 'admin' AND actif = true;
```

Si 0 ligne → créer un admin d'abord, sinon verrou complet.

## Rollback

Pas de rollback automatisé autre que `005_rls_proper_rollback.sql`. Pour rollback d'une autre migration : snapshot Supabase → restauration manuelle.
