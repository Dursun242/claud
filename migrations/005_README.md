# Migration 005 — RLS Proper

## Pourquoi cette migration ?

Avant cette migration, toutes les tables avaient une policy :
```sql
CREATE POLICY "Allow all" ON <table> FOR ALL USING (true) WITH CHECK (true);
```

Ça veut dire que **n'importe quelle personne avec la clé `NEXT_PUBLIC_SUPABASE_ANON_KEY`** (qui est publique par design, incluse dans le bundle JS servi au navigateur) pouvait lire, modifier et supprimer **toutes les données** de la base. Un simple `curl` avec la clé suffisait à vider la base.

Cette migration remplace ces policies par un modèle propre basé sur les rôles déjà définis dans `authorized_users`.

## Modèle de rôles

| Rôle | chantiers | os / cr / taches / planning | contacts / rdv / sharing / templates / settings | authorized_users |
|---|---|---|---|---|
| **`admin`** | CRUD complet | CRUD complet | CRUD complet | CRUD complet |
| **`salarié`** / **`salarie`** | CRUD sauf delete chantier (admin) | CRUD sauf delete OS (admin) | CRUD (sauf settings admin-only) | Voit son profil |
| **`client`** (MOA) | **Read-only**, uniquement ses chantiers (match par prénom) | **Read-only** sur les objets liés à ses chantiers, + commentaires sur ses objets | Aucun accès | Voit son profil |
| **anonyme** (sans JWT) | 🚫 Rien | 🚫 Rien | 🚫 Rien | 🚫 Rien |

> ⚠️ **Note importante** : le filtrage client → chantier se fait via `chantiers.client ILIKE '%prenom%'` parce que c'est la logique du code existant (`shared.js:loadForClient`). C'est **fragile** (deux MOA avec le même prénom = collision). Un vrai fix consisterait à ajouter une colonne `client_email` à la table `chantiers` et matcher dessus. À faire dans une migration ultérieure.

## Fonctions helper créées

- `public.auth_email()` → email du user connecté (lowercase, trim)
- `public.is_staff()` → TRUE si le user est admin ou salarié
- `public.is_admin()` → TRUE si le user est admin
- `public.client_prenom()` → prénom du user si c'est un client, sinon NULL
- `public.client_has_chantier(ch_id UUID)` → TRUE si le client courant a accès à ce chantier

Toutes sont `SECURITY DEFINER` pour éviter la récursion infinie sur les policies de `authorized_users`.

## Avant d'exécuter

1. **Snapshot Supabase** : Dashboard → Database → Backups → Create backup
2. **Vérifier qu'il y a au moins un admin actif** :
   ```sql
   SELECT email, prenom, role, actif
   FROM authorized_users
   WHERE role = 'admin' AND actif = true;
   ```
   **Si cette requête retourne 0 ligne, N'EXÉCUTE PAS la migration** — tu te lockerais out. Crée un admin d'abord.
3. Si possible, tester en staging avant la prod.

## Exécution

**Via Supabase Dashboard** (recommandé) :
1. Dashboard → SQL Editor → New query
2. Copier-coller le contenu de `005_rls_proper.sql`
3. Run

**Via CLI Supabase** :
```bash
supabase db execute --file migrations/005_rls_proper.sql
```

## Tests à faire IMMÉDIATEMENT après

1. **Admin** : connexion → doit voir TOUS les chantiers dans le dashboard admin
2. **Salarié** : connexion → doit voir tous les chantiers, tous les OS/CR
3. **Client (MOA)** : connexion → doit voir UNIQUEMENT les chantiers où `chantiers.client` contient son prénom
4. **Admin** : ajouter un nouvel user via l'UI admin → doit fonctionner
5. **Salarié** : tenter de supprimer un OS → doit échouer (admin only)
6. **Client** : tenter d'accéder à la page `/admin` → doit être bloqué

## En cas de problème

Si tu te retrouves avec une app qui ne charge rien ou qui affiche des erreurs permission denied :

1. Réexécute le fichier de rollback :
   ```
   migrations/005_rls_proper_rollback.sql
   ```
   Cela remet la base dans son état ouvert d'avant (⚠️ insécurité revient).

2. Identifie le problème (check les logs Supabase, tests les policies une par une dans le SQL Editor).

3. Corrige la migration et retente.

## Points de vigilance identifiés

- **Mismatch `salarié` vs `salarie`** : le code insère les deux variantes selon les fichiers. Les helpers gèrent les deux. Nettoie éventuellement la table pour normaliser :
  ```sql
  UPDATE authorized_users SET role = 'salarie' WHERE role = 'salarié';
  ```
  (à faire APRÈS avoir vérifié que ça ne casse rien ailleurs dans le code).

- **Collision de prénoms** : deux clients MOA avec le même prénom verront les chantiers l'un de l'autre. Si ça peut arriver dans ta base, migre vers un match par email.

- **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** reste publique — c'est normal. Ce qui change : sans JWT valide, cette clé ne permet plus rien.

- **La route `/api/admin/users`** utilise déjà `SUPABASE_SERVICE_ROLE_KEY` côté serveur, qui bypass la RLS. Rien à changer.
