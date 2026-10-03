# 036 — Documents administratifs des entreprises

Ajoute le suivi des documents obligatoires des entreprises (obligation de vigilance du maître d'œuvre) :

- **Kbis** (ou extrait D1 / avis de situation INSEE pour un artisan) : moins de 3 mois ;
- **Attestation d'assurance décennale** : période de validité indiquée sur l'attestation ;
- **Attestation de régularité fiscale** : à renouveler tous les 6 mois ;
- **Attestation de vigilance URSSAF** : à renouveler tous les 6 mois.
- **RIB** (migration 037) : sans date de validité ; l'IBAN est comparé à celui de la fiche (alerte en cas de changement).

## Tables

| Table | Rôle |
|---|---|
| `contact_documents` | Un document déposé (fichier dans `attachments/conformite/…`) et ce qui y a été lu : date, fin de validité, SIRET, assureur, activités couvertes, anomalies. |
| `contact_doc_requests` | Liens de dépôt envoyés aux entreprises (`/deposer/<jeton>`, 30 jours). |

Lecture réservée à l'équipe (`is_staff()`), écriture uniquement par le serveur (routes `/api/conformite`, service role). Le maître d'ouvrage n'y a pas accès.

## Application

Coller le fichier dans le SQL Editor de Supabase et exécuter. Idempotent.

Sans cette migration, l'application fonctionne comme avant : la section « Documents » des fiches entreprises affiche un message demandant d'appliquer la migration.
