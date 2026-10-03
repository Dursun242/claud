# Migration 035 — Accès client par compte uniquement

## Ce qui change

Jusqu'ici (019), un chantier **sans** `client_user_id` restait visible par tout client dont le prénom apparaît dans le champ texte `client` : deux clients « Jean » se voyaient mutuellement, « Al » voyait les chantiers d'« Alain ». Les notifications choisissaient aussi le client destinataire par prénom.

Après 035 :

- **Un client ne voit que les chantiers rattachés à son compte** (`chantiers.client_user_id = auth.uid()`) : policy `chantiers_select` et `client_has_chantier()` (donc tâches, OS, CR, planning, commentaires, pièces jointes, PV). Plus aucune branche « prénom ».
- **Notifications** (`create_activity_notification` et `create_activity_notification_ex`, utilisées par tous les triggers) : le client prévenu est le compte rattaché au chantier, plus un client trouvé par prénom.
- **Rattachement automatique plus strict** (`resolve_client_user_id`, utilisé par le trigger de 019 et par la connexion) : le prénom doit apparaître en **mot entier** dans le champ `client` (« Al » ≠ « Alain Dupal », « Jean » ≠ « Jean-Pierre Durand », « Jean » = « M. Jean Martin »), insensible à la casse, et un seul client actif doit correspondre — sinon rien n'est rattaché.
- **`link_my_chantiers()`** : appelée par l'application à la connexion d'un client, rattache à son compte les chantiers sans compte qui le désignent sans ambiguïté.
- **`client_accounts()`** : liste des comptes clients (champ « Compte client » de la fiche chantier). Réservée à l'équipe : pour un autre compte, elle ne renvoie aucune ligne.
- **Prospects démo** (comptes client « DémoMOA ») : ils partagent les chantiers de démo (`is_demo = true`, données fictives). Exception limitée (`is_demo_client()`) : un compte démo voit les chantiers de démo et aucun chantier réel ; un vrai client ne voit pas les chantiers de démo. Les comptes démo ne sont jamais rattachés à un chantier ni proposés dans la liste « Compte client ».

`client_user_id` **reste facultatif** (pas de `NOT NULL`, contrairement à l'étape 5 du README 019) : les chantiers internes ou en prospection n'ont pas de client, et un client peut ne pas encore avoir de compte. Un chantier sans compte rattaché est simplement visible par l'équipe seule.

## Avant d'appliquer : diagnostic

Dans le SQL Editor, lister les chantiers qui ont un client renseigné mais aucun compte rattaché, avec le nombre de comptes clients qui correspondent selon la nouvelle règle :

```sql
SELECT c.id, c.nom, c.client,
       count(cand.user_id) AS comptes_candidats,
       string_agg(cand.email, ', ' ORDER BY cand.email) AS emails_candidats
FROM chantiers c
LEFT JOIN LATERAL (
  SELECT u.id AS user_id, au.email
  FROM authorized_users au
  JOIN auth.users u ON lower(trim(u.email)) = lower(trim(au.email))
  WHERE au.actif = true
    AND au.role = 'client'
    AND trim(coalesce(au.prenom, '')) <> ''
    AND c.client ~* (
      '(^|[^[:alnum:]À-ÖØ-öø-ÿŒœ_-])'
      || regexp_replace(trim(au.prenom), '([.^$*+?()\[\]{}|\\])', '\\\1', 'g')
      || '($|[^[:alnum:]À-ÖØ-öø-ÿŒœ_-])'
    )
) cand ON true
WHERE c.client_user_id IS NULL
  AND trim(coalesce(c.client, '')) <> ''
GROUP BY c.id, c.nom, c.client
ORDER BY c.nom;
```

- `comptes_candidats = 1` : rattachement automatique à la prochaine connexion du client.
- `0` ou `2+` : rattachement à faire à la main (voir plus bas).

## Après la migration, pour ces chantiers

Le client **ne les voit plus** (et n'en reçoit plus les notifications) tant qu'ils ne sont pas rattachés à son compte. Trois façons de les rattacher :

1. **Automatiquement** à sa prochaine connexion, si un seul compte client correspond (`link_my_chantiers()`).
2. **Par l'équipe**, dans l'application : fiche chantier → champ « Compte client ».
3. **En SQL** :

```sql
-- Retrouver l'uuid d'un client par son email
SELECT u.id, u.email, au.prenom, au.nom, au.actif
FROM auth.users u
JOIN authorized_users au ON lower(trim(au.email)) = lower(trim(u.email))
WHERE lower(trim(u.email)) = lower(trim('client@exemple.fr'));

-- Rattacher le chantier
UPDATE chantiers SET client_user_id = '<uuid>' WHERE id = '<id>';
```

Pas de ligne pour l'email : le client ne s'est encore jamais connecté (pas de compte `auth.users`). Le rattachement se fera à sa première connexion, ou à la main ensuite.

### Contrôle conseillé après application

Les rattachements faits par 019 utilisaient l'ancienne règle (prénom contenu n'importe où). Liste des chantiers dont le compte rattaché ne correspond pas à la nouvelle règle, à vérifier (un rattachement fait à la main volontairement peut aussi apparaître) :

```sql
SELECT c.id, c.nom, c.client, u.email AS compte_rattache
FROM chantiers c
JOIN auth.users u ON u.id = c.client_user_id
WHERE public.resolve_client_user_id(c.client) IS DISTINCT FROM c.client_user_id
ORDER BY c.nom;
```

Les vérifications de droits sont en commentaire à la fin de `035_acces_client_par_compte.sql`.

## Rollback

Recréer les versions de 019 (cela **rouvre** l'accès par prénom) :

1. Réexécuter, depuis `019_client_user_id.sql`, les blocs 3 (`resolve_client_user_id`), 6 (`client_has_chantier`) et 7 (policy `chantiers_select`), dans un `BEGIN; … COMMIT;`.
2. Réexécuter le bloc 1 de `034_durcissement_audit.sql` pour `resolve_client_user_id` (`REVOKE … FROM PUBLIC, anon, authenticated` + `GRANT … TO service_role`).
3. Notifications : réexécuter la fonction `create_activity_notification` de `011_notifications_triggers.sql` et `create_activity_notification_ex` de `012_notifications_max.sql` (seulement ces deux fonctions), puis `031_securite_fonctions_index.sql`.
4. Garder `link_my_chantiers()` et `client_accounts()` si l'application les appelle encore (sans danger). Sinon :
   ```sql
   DROP FUNCTION IF EXISTS public.link_my_chantiers();
   DROP FUNCTION IF EXISTS public.client_accounts();
   ```

Les rattachements (`client_user_id`) faits entre-temps restent valables.
