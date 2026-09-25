# 028 — Devis ↔ Qonto

Ajoute à `crm_devis` les colonnes `qonto_quote_id`, `qonto_client_id`,
`qonto_url`, `qonto_synced_at` et `qonto_hash`.

## Pourquoi

Le bouton « Enregistrer dans Qonto » d'un devis (et l'envoi par mail, qui
l'enregistre automatiquement) crée le devis dans Qonto, qui lui attribue son numéro
que le CRM reprend. L'identifiant Qonto est conservé pour que les
modifications suivantes mettent à jour ce devis au lieu d'en créer un autre.

## Application

SQL Editor Supabase → coller `028_crm_devis_qonto.sql` → Run. Idempotent.

Sans cette migration, le bouton Qonto affiche « Appliquer la migration 028 »
et rien n'est envoyé à Qonto.

## Fonctionnement

- Client Qonto : retrouvé par email ou nom (contact de l'affaire), créé
  s'il n'existe pas.
- Numéro : **attribué par Qonto**. Un nouveau devis a un numéro provisoire
  (`PROV-…`, affiché « N° Qonto en attente ») ; il est créé dans Qonto sans
  numéro et le CRM reprend le numéro attribué par Qonto. Si Qonto exige un
  numéro (numérotation automatique désactivée chez lui), le CRM continue la
  séquence des devis existants dans Qonto.
- Lignes : désignation, quantité, unité, prix HT, TVA ; les titres de section
  deviennent la description des lignes qui suivent. Remise globale envoyée en
  montant.
- Le total TTC renvoyé par Qonto est comparé à celui de l'application : un
  écart est signalé.
- Le token Qonto est celui déjà saisi dans l'onglet Qonto (table `settings`).

## Qonto = document de référence

- Chaque enregistrement d'un devis dans l'application le crée / met à jour
  dans Qonto. Un échec est affiché (« enregistré dans l'application mais PAS
  dans Qonto : … »).
- Envoi : la fenêtre « Envoyer » met le devis à jour dans Qonto, récupère le
  PDF édité par Qonto (bouton « Vérifier le PDF Qonto »), puis l'envoie. Seul
  ce PDF part au client : si Qonto ne le fournit pas, l'envoi est impossible
  (bouton « Réessayer »).
- Le bouton PDF de la liste télécharge aussi le PDF Qonto.
- Suivi : à l'ouverture du CRM, un devis accepté dans Qonto passe
  « Accepté » (affaire « Gagné »), un devis annulé passe « Refusé ».

## Import des devis existants

Bouton « ↓ Devis Qonto » du CRM : les devis présents dans Qonto mais pas
encore dans le CRM sont importés (lignes, remise, conditions, statut
accepté / annulé / envoyé). L'affaire liée au devis (migration 026) est
réutilisée, sinon une affaire est créée (contact retrouvé par email).
Idempotent : un devis déjà importé ou créé depuis le CRM est ignoré. Un
numéro déjà utilisé par un autre devis du CRM est signalé et non importé.

## Statuts et suppressions

- Qonto → CRM : devis accepté dans Qonto → « Accepté » (affaire « Gagné »),
  annulé → « Refusé » ; devis supprimé dans Qonto → signalé « supprimé dans
  Qonto » dans la liste (« ↻ Qonto » le recrée).
- CRM → Qonto : suppression d'un devis dans le CRM → supprimé aussi dans
  Qonto (après confirmation ; si Qonto refuse, choix de ne supprimer que du
  CRM). Accepté / refusé dans le CRM (ou signé en ligne) → tentative de mise à
  jour du statut dans Qonto ; Qonto ne documentant pas ce changement par
  l'API, un message invite à le faire dans Qonto s'il n'est pas appliqué.

