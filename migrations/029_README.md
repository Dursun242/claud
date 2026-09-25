# 029 — Devis : signature électronique

Ajoute à `crm_devis` les colonnes `odoo_sign_id`, `odoo_sign_url` et
`statut_signature`.

## Fonctionnement

- Fenêtre « Envoyer » d'un devis : option **Signature électronique**
  (cochée par défaut). Le PDF Qonto vérifié est envoyé à Odoo Sign avec une
  zone de signature « Client » en bas à droite de la dernière page ; Odoo
  envoie au client un e-mail avec le lien de signature. Le mail
  d'accompagnement (PDF joint) part comme avant et le signale.
- Suivi : à l'ouverture du CRM, les signatures en attente sont vérifiées
  auprès d'Odoo. Devis signé → « Accepté » (affaire « Gagné ») ; refusé →
  « Refusé ». Le PDF signé se télécharge depuis la liste des devis.
- Utilise la configuration Odoo déjà en place pour les OS (`ODOO_*`).

## Application

SQL Editor Supabase → coller `029_crm_devis_signature.sql` → Run.
Sans cette migration, l'option de signature affiche « Appliquer la
migration 029 » et rien n'est envoyé à Odoo.
