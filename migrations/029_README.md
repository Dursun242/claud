# 029 — Devis : signature électronique intégrée

Signature électronique **sans service tiers** (ni Odoo, ni Yousign) :
signature électronique simple au sens du règlement eIDAS, suffisante pour un
devis (« bon pour accord »).

## Fonctionnement

1. Fenêtre « Envoyer » d'un devis : option **✍️ Signature électronique**
   (cochée par défaut). Le PDF Qonto vérifié est conservé et un lien
   sécurisé (`/signer/<jeton>`, jeton aléatoire de 256 bits) est ajouté au
   mail envoyé au client.
2. Le client ouvre le lien (sans compte) : il consulte le devis, saisit son
   nom, signe au doigt ou à la souris et coche « Bon pour accord ».
3. La signature, le nom, la date et l'heure sont apposés sur la dernière page
   du PDF. Sont conservés comme preuves : date/heure, adresse IP, navigateur,
   empreinte SHA-256 du PDF d'origine (imprimée sur le PDF signé).
4. Le devis passe « Accepté », l'affaire « Gagné ». Le PDF signé se
   télécharge depuis la liste des devis (« ✍️ PDF signé »).

Le lien n'est plus utilisable après signature, ni après la date de validité
du devis.

## Application

SQL Editor Supabase → coller `029_crm_devis_signature.sql` → Run.
Sans cette migration, l'option de signature affiche « Appliquer la
migration 029 ».
