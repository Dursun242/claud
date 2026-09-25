# 028 — Devis ↔ Qonto

Ajoute à `crm_devis` les colonnes `qonto_quote_id`, `qonto_client_id`,
`qonto_url`, `qonto_synced_at` et `qonto_hash`.

## Pourquoi

Le bouton « Enregistrer dans Qonto » d'un devis (et l'envoi par mail, qui
l'enregistre automatiquement) crée le devis dans Qonto avec **le même numéro**
(`26-050`, `26-051`…). L'identifiant Qonto est conservé pour que les
modifications suivantes mettent à jour ce devis au lieu d'en créer un autre.

## Application

SQL Editor Supabase → coller `028_crm_devis_qonto.sql` → Run. Idempotent.

Sans cette migration, le bouton Qonto affiche « Appliquer la migration 028 »
et rien n'est envoyé à Qonto.

## Fonctionnement

- Client Qonto : retrouvé par email ou nom (contact de l'affaire), créé
  s'il n'existe pas.
- Numéro : celui de l'application. Les numéros déjà utilisés dans Qonto sont
  pris en compte pour proposer le numéro suivant d'un nouveau devis. Si Qonto
  impose sa propre numérotation automatique, le devis de l'application
  reprend le numéro attribué par Qonto.
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
