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
| 019 | `019_client_user_id.sql` | **[P0 sécu]** Match client → chantier par UUID au lieu de prénom. Dual-support (nouveau UUID + fallback prénom pour migration en douceur). Voir `019_README.md` avant application. |
| 020 | `020_chantier_counts_rpc.sql` | **[Perf]** RPC `chantier_attachment_counts()` qui agrège les PJ par chantier côté Postgres. Remplace le téléchargement de toute la table `attachments` au démarrage. Voir `020_README.md`. Fallback silencieux côté front si pas encore appliquée. |
| 021 | `021_storage_rls_granular.sql` | **[P0 sécu]** Storage RLS granulaire par `file_path`. Remplace la policy "authenticated = tout accessible" par un check d'existence d'une ligne `attachments` visible (qui elle hérite de la RLS chantier). Empêche un MOA de lire les PJ d'un autre chantier via URL devinée. Voir `021_README.md`. |
| 022 | `022_os_tva_non_applicable.sql` | Flag `tva_non_applicable` sur `ordres_service` pour les auto-entrepreneurs en franchise de base (art. 293 B du CGI). Voir `022_README.md`. |
| 023 | `023_drop_dead_tables.sql` | **[Nettoyage sécu]** Supprime 7 tables mortes des migrations 001/002 (`user_roles`, `plans`, `photo_reports`, `photos`, `os_validations`, `cr_commentaires`, `chantier_photos`) : inutilisées côté app + policies « Allow all » / rôles parallèles. **Lire `023_README.md` et exécuter la vérification pré-exécution avant d'appliquer.** |
| 024 | `024_compte_rendus_intervenants.sql` | Colonne `intervenants` (JSONB) sur `compte_rendus` : sélection des intervenants par case à cocher (au lieu du seul champ texte libre "Participants"), affichés en tableau sur le PDF. |
| 025 | `025_crm.sql` | **Module CRM** : tables `crm_opportunites` (pipeline commercial) et `crm_interactions` (historique des échanges + relances). RLS staff uniquement. Voir `025_README.md`. Fallback silencieux côté front si pas encore appliquée. |
| 026 | `026_crm_qonto_link.sql` | Colonnes `qonto_quote_id` / `qonto_quote_number` sur `crm_opportunites` : création d'une opportunité depuis un devis Qonto, sans doublon. Voir `026_README.md`. |
| 027 | `027_crm_devis.sql` | **Module Devis** : table `crm_devis` (lignes JSONB, totaux, statut Brouillon / Envoyé / Accepté / Refusé) rattachée à `crm_opportunites`. RLS staff uniquement. Voir `027_README.md`. |
| 028 | `028_crm_devis_qonto.sql` | Colonnes `qonto_quote_id` / `qonto_client_id` / `qonto_url` / `qonto_synced_at` / `qonto_hash` sur `crm_devis` : enregistrement du devis dans Qonto avec le même numéro. Voir `028_README.md`. |
| 029 | `029_crm_devis_signature.sql` | Signature électronique intégrée des devis (lien sécurisé, signature apposée sur le PDF Qonto, preuves). Voir `029_README.md`. |
| 030 | `030_crm_devis_suivi.sql` | Suivi des devis : ouvertures du mail (image de suivi) et consultations du lien de signature, visibles par l'équipe. Voir `030_README.md`. |
| 031 | `031_securite_fonctions_index.sql` | Retire l'exécution publique (RPC) des fonctions internes de notification (`create_activity_notification`, `_ex`, `chantier_name`) + index `rdv(chantier_id)` et `contact_chantiers(chantier_id)`. Sans impact sur les notifications automatiques. |
| 032 | `032_notifications_qonto_serveur.sql` | Notifications et jeton Qonto côté serveur uniquement : retire l'accès RPC aux fonctions « destinataires » (018), supprime la policy INSERT de `notifications`, rend la ligne `settings.qonto-token` invisible via l'API. **À appliquer après le déploiement** de la version qui contient `/api/qonto/token`. |
| 033 | `033_cr_suivi_taches.sql` | **Refonte des comptes rendus** : sections par lot (avancement, observations, photos), points suivis d'un CR à l'autre (n° de point, entreprise, photos, rappels, CR d'origine), convocation (`prochaine_reunion`), statut Brouillon / Diffusé (le maître d'ouvrage ne voit pas les brouillons). Sans elle, les CR restent enregistrables (sans le suivi). |
| 034 | `034_durcissement_audit.sql` | **[Sécu]** Retire l'exécution RPC de `seed_demo_data()` et `resolve_client_user_id(TEXT)` (service role conservé), plus de notification sur la modification d'un CR en « Brouillon », suppression / écrasement des fichiers du bucket `attachments` réservés à l'équipe. À appliquer après 033. Voir `034_README.md`. |
| 035 | `035_acces_client_par_compte.sql` | **[P0 sécu]** Fin de l'accès client par prénom : un client ne voit que les chantiers rattachés à son compte (`client_user_id`), notifications client par compte, rattachement automatique par prénom en mot entier (`link_my_chantiers()` à la connexion), liste des comptes clients pour l'équipe (`client_accounts()`). **Lancer le diagnostic de `035_README.md` avant d'appliquer** : les chantiers sans compte rattaché ne sont plus visibles par le client. |
| 036 | `036_conformite_entreprises.sql` | **Documents des entreprises** : Kbis, décennale, attestation fiscale, attestation URSSAF par contact (`contact_documents`), liens de dépôt envoyés aux entreprises (`contact_doc_requests`). Lecture staff, écriture serveur. Voir `036_README.md`. |
| 037 | `037_conformite_rib.sql` | **RIB des entreprises** : type de document `rib` + colonnes `iban` / `bic` sur `contact_documents`. IBAN comparé à celui de la fiche (alerte faux RIB). À appliquer après 036. |
| 038 | `038_conformite_relances_pause.sql` | **Relances des documents** : suspension par entreprise (`contacts.relances_suspendues`, `relances_reprise_le`). À appliquer après 037. |
| 039 | `039_conformite_controle_legal.sql` | **Contrôle légal des entreprises** : table `contact_legal_checks` (entreprise fermée / procédure collective, d'après l'annuaire des entreprises et le BODACC). Lecture staff, écriture serveur. À appliquer après 038. |

## Fichiers NON séquentiels (à ne PAS appliquer en séquence)

| Fichier | Statut | Notes |
|---|---|---|
| `005_rls_proper_rollback.sql` | 🚑 Disaster recovery | À n'exécuter que si 005 casse la prod. Restaure l'état "Allow all" **insécurisé**. |
| `add-chantier-photo-notes.sql` | Legacy / ad-hoc | Vérifier si déjà appliqué via schéma avant ré-exécution |
| `add-odoo-sign-to-os.sql` | Legacy / ad-hoc | idem |
| `fix-add-admin-user.sql` | Hotfix ponctuel | idem |
| `fix-create-storage-bucket.sql` | Hotfix ponctuel | idem |
| `fix-storage-rls-policies.sql` | ⚠ Obsolète | **Ne pas réexécuter** : rouvre tout le bucket, annule les policies préfixées de 021. |

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
