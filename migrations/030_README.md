# 030 — Suivi des ouvertures des devis

## Ce que ça fait

Dans le CRM, chaque devis envoyé affiche :

- **👁 ouvert N×** : le client a ouvert le mail (image invisible chargée par
  sa messagerie) — date de la dernière ouverture ;
- **🔗 consulté N×** : le client a ouvert le lien de signature en ligne
  (page ou PDF).

Survoler la ligne affiche l'historique détaillé (date et heure de chaque
événement). Visible uniquement par l'équipe (admin / salarié) : table
`crm_devis_events`, lecture staff (RLS), écriture serveur seulement.

## Application

SQL Editor Supabase → coller `030_crm_devis_suivi.sql` → Run. Sans la
migration, les mails partent normalement, sans suivi.

## Limites (à connaître)

- **Ouverture = images affichées.** Si la messagerie du client bloque les
  images (Outlook par défaut, certains webmails pro), l'ouverture n'est pas
  détectée. La consultation du lien de signature, elle, l'est toujours.
- **Apple Mail (confidentialité)** et certains antispams pré-chargent les
  images : une « ouverture » peut apparaître sans lecture réelle.
- Gmail passe par ses serveurs : l'adresse IP enregistrée est celle de
  Google, pas celle du client.
- Tes propres ouvertures ne comptent pas : la copie envoyée à l'expéditeur
  ne contient pas l'image de suivi.
- Ouvertures répétées à moins de 2 minutes : comptées une seule fois.

## RGPD / CNIL

La CNIL considère que le suivi individuel de l'ouverture des mails par pixel
nécessite en principe l'information et le consentement du destinataire. Pour
un devis envoyé à la demande du client, le risque est faible, mais le plus
sûr est de le mentionner (ex. dans les conditions ou la politique de
confidentialité). La consultation du lien de signature relève du
fonctionnement normal du service.
