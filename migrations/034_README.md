# 034 — Durcissement (suite d'audit)

## Ce que ça fait

- **`seed_demo_data()`** et **`resolve_client_user_id(TEXT)`** ne sont plus
  appelables via l'API Supabase (`/rest/v1/rpc`) par un compte connecté ou
  anonyme. Restent utilisables par le serveur (service role :
  `/api/admin/reset-demo-data`) et par le trigger
  `trg_chantiers_fill_client_user_id` (019).
- **Comptes rendus en brouillon** : le trigger `notify_on_cr_update` ne crée
  plus de notification tant que le CR est en « Brouillon » (colonne
  `statut`, 033). La notification part à la diffusion.
- **Pièces jointes (Storage, bucket `attachments`)** : suppression et
  écrasement réservés à l'équipe (`is_staff()`). Un maître d'ouvrage garde la
  lecture des fichiers de ses chantiers. Le dépôt (policy INSERT de 021)
  ne change pas.

## Application

Après 033. SQL Editor Supabase → coller `034_durcissement_audit.sql` → Run.
Ré-exécutable sans erreur. Requêtes de vérification en fin de fichier.

## Hors périmètre

- La création d'un CR en brouillon (`notify_on_cr_insert`, 011) notifie
  toujours.
- Le repli par prénom de 019 (`client_has_chantier`) est conservé : le
  retirer demande d'abord de renseigner `client_user_id` sur tous les
  chantiers.
