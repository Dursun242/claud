# Migration 019 — `client_user_id` (P0 RLS hardening)

## Pourquoi

Jusqu'ici les clients voyaient leurs chantiers via un match sur le **prénom** :
```sql
chantiers.client ILIKE '%' || client_prenom() || '%'
```

Fragile : **deux clients qui s'appellent "Jean" voient les chantiers l'un de l'autre.** C'est la principale dette de sécurité identifiée dans les audits.

La migration 005 notait déjà le problème : *« Un vrai fix consisterait à ajouter une colonne `client_email` à la table `chantiers` et matcher dessus. »*

## Ce que fait cette migration

1. **Ajoute `client_user_id UUID`** sur `chantiers` (référence `auth.users(id)`, nullable pendant la transition).
2. **Fonction `resolve_client_user_id(text)`** (`SECURITY DEFINER`) qui traduit le champ texte vers un UUID, ou `NULL` si ambigu.
3. **Backfill automatique** des chantiers existants via cette fonction. Les cas ambigus (0 ou plusieurs matches) sont laissés `NULL` — intentionnellement conservateur.
4. **Trigger AVANT INSERT/UPDATE** sur `chantiers` : remplit `client_user_id` à chaque création/modification si la colonne est vide et que la résolution est non ambiguë. Plus besoin de toucher le code applicatif — la DB fait le travail.
5. **Nouvelle version de `client_has_chantier(ch_id)`** : accepte désormais **les deux mécanismes** :
   - Si `client_user_id` est rempli → match par UUID (robuste, pas de collision possible).
   - Sinon → fallback sur le prénom (ancien comportement, pour ne pas casser les chantiers non backfillés).
6. **Policy `chantiers_select`** mise à jour pour la même logique dual.
7. **Index partiel** sur `client_user_id WHERE NOT NULL` pour la perf RLS.

Les policies des tables filles (`taches`, `ordres_service`, `compte_rendus`, `planning`, `comments`, `attachments`) utilisent déjà `client_has_chantier()` → elles héritent automatiquement du durcissement.

## Effet sur le code applicatif

**Rien ne casse immédiatement et aucun code applicatif à modifier.** Le trigger SQL gère le remplissage automatique de `client_user_id` côté base à chaque création/update de chantier. Les anciens chantiers non backfillés continuent de fonctionner via le fallback prénom.

## Procédure de rollout

### Étape 1 — Appliquer la migration

Via Supabase Dashboard → SQL Editor → copier-coller `019_client_user_id.sql` → **Run**.

### Étape 2 — Vérifier le backfill

```sql
SELECT
  COUNT(*) FILTER (WHERE client_user_id IS NOT NULL) AS backfillés,
  COUNT(*) FILTER (WHERE client_user_id IS NULL)     AS à_compléter,
  COUNT(*)                                            AS total
FROM chantiers;
```

### Étape 3 — Compléter les chantiers non backfillés

```sql
-- Lister les chantiers sans client_user_id
SELECT id, nom, client FROM chantiers WHERE client_user_id IS NULL ORDER BY nom;

-- Lister les candidats possibles
SELECT au.email, au.prenom, u.id AS user_id
FROM authorized_users au
LEFT JOIN auth.users u ON lower(trim(u.email)) = lower(trim(au.email))
WHERE au.role = 'client' AND au.actif = true
ORDER BY au.prenom;

-- Assigner manuellement le bon UUID
UPDATE chantiers SET client_user_id = '<uuid>' WHERE id = '<chantier_id>';
```

### Étape 4 — Test fonctionnel

- Connecter un client → vérifier qu'il voit UNIQUEMENT ses chantiers
- Connecter un autre client homonyme (si pertinent) → confirmer qu'il ne voit PAS ceux du premier
- Connecter admin / salarié → accès inchangé

### Étape 5 (plus tard) — Durcir la contrainte

Une fois que **100 % des chantiers** ont un `client_user_id`, on retire le fallback prénom dans une migration future :

```sql
-- Migration 02X (future)
CREATE OR REPLACE FUNCTION public.client_has_chantier(ch_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM chantiers
    WHERE id = ch_id AND client_user_id = auth.uid()
  )
$$;

-- Et rendre la colonne NOT NULL
ALTER TABLE chantiers ALTER COLUMN client_user_id SET NOT NULL;
```

## Rollback d'urgence

Si quelque chose casse :
```sql
-- Revenir à la version prénom-only de client_has_chantier
-- (cf migration 005 — copie du bloc « client_has_chantier » et réexécute)
```

Ne pas supprimer la colonne `client_user_id` : elle est additive, donc sans effet si le code continue de la remplir silencieusement.

## Risques connus

- **Homonymes exacts avec prénoms identiques** dans `authorized_users` → la requête de backfill évite de deviner (laisse NULL). Il faudra corriger manuellement.
- **Clients sans compte auth** (pas encore invités) → pas de backfill possible. Le chantier reste sur le fallback prénom jusqu'à ce que le client soit invité et qu'on complète.
