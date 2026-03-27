# Refonte Complète - Instructions de Déploiement

## Phase 1: Exécuter la migration Supabase

### 1.1 Aller sur le dashboard Supabase
1. Se connecter à https://app.supabase.com
2. Sélectionner votre projet
3. Aller à **SQL Editor**

### 1.2 Exécuter la migration
1. Copier tout le contenu du fichier `migrations/001_refonte_complete.sql`
2. Coller dans l'éditeur SQL
3. Cliquer sur **Run** ou **Exécuter**

> ⚠️ **Important**: La migration va:
> - Ajouter `client_id` et `salarie_ids` à la table `chantiers`
> - Créer les tables `user_roles`, `plans`, `photo_reports`, `photos`
> - Configurer les RLS policies automatiquement
> - Créer les index pour performance

### 1.3 Vérifier le succès
- Vérifier dans **Table Editor** que les nouvelles tables existent
- Vérifier dans **SQL Editor** -> **Runs** que les requêtes sont passées

---

## Phase 2: Configurer les rôles utilisateurs

### 2.1 Ajouter les rôles aux utilisateurs
Pour chaque utilisateur, vous devez ajouter un rôle via SQL:

```sql
-- Pour un ADMIN (vous):
INSERT INTO user_roles (user_id, role)
VALUES ('votre-user-id-uuid', 'admin')
ON CONFLICT(user_id) DO UPDATE SET role='admin';

-- Pour un CLIENT:
INSERT INTO user_roles (user_id, role)
VALUES ('client-user-id', 'client')
ON CONFLICT(user_id) DO UPDATE SET role='client';

-- Pour un SALARIÉ:
INSERT INTO user_roles (user_id, role)
VALUES ('salarie-user-id', 'salarie')
ON CONFLICT(user_id) DO UPDATE SET role='salarie';
```

Comment obtenir l'user_id:
1. Aller à **Authentication** -> **Users**
2. Chercher l'utilisateur et copier son **User ID**

### 2.2 Lier les clients aux chantiers
Pour chaque chantier, définir le client propriétaire:

```sql
UPDATE chantiers
SET client_id = 'client-user-id'
WHERE nom = 'Nom du chantier';
```

### 2.3 Lier les salariés aux chantiers
Pour assigner des salariés à des chantiers:

```sql
UPDATE chantiers
SET salarie_ids = ARRAY['salarie-id-1', 'salarie-id-2']
WHERE id = 'chantier-id';
```

---

## Phase 3: Mettre à jour le code React

### 3.1 Modifier `dashboard.js`
Remplacer le contenu par l'utilisation du nouveau `RoleBasedDashboard`:

```javascript
'use client'
import RoleBasedDashboard from './roleBasedDashboard'

export default function Dashboard({ user, profile }) {
  return <RoleBasedDashboard user={user} profile={profile} />
}
```

### 3.2 Configurer le Storage Supabase
Pour le stockage des plans et photos:

1. Aller à **Storage** dans Supabase
2. Créer un nouveau bucket **documents** (ou utiliser un existant)
3. Configurer les permissions RLS pour le bucket

---

## Phase 4: Comprendre les trois dashboards

### AdminDashboard
- **Accès**: Tous les chantiers, tous les utilisateurs, tous les données
- **Onglets**: Dashboard, Chantiers, Planning, Tâches, Contacts, Comptes Rendus, Ordres Service, Plans, Photos, Agenda, Finances, IA, Admin
- **Actions**: Créer/modifier/supprimer n'importe quoi

### ClientDashboard
- **Accès**: Uniquement ses chantiers (où il est client_id)
- **Onglets**: Vue générale, Mes chantiers, Planning, Comptes Rendus, Ordres Service, Plans, Reportages, Agenda
- **Actions**: Voir les plans et photos, mais pas créer de contacts

### SalarieDashboard
- **Accès**: Ses chantiers assignés (salarie_ids)
- **Onglets**: Vue générale, Mes chantiers, Mon planning, Mes tâches, Ordres Service, Plans, Reportages, Agenda, Assistant IA
- **Actions**: Gérer ses tâches, voir les plans et photos

---

## Phase 5: Tester les permissions

### Test 1: Se connecter comme Admin
- Devrait voir TOUS les chantiers
- Devrait avoir accès à tous les onglets

### Test 2: Se connecter comme Client
- Devrait voir UNIQUEMENT ses chantiers
- Ne devrait PAS voir l'onglet Admin
- Ne devrait PAS voir la liste de contacts complète

### Test 3: Se connecter comme Salarié
- Devrait voir UNIQUEMENT ses chantiers assignés
- Ne devrait PAS voir l'onglet Admin
- Devrait pouvoir créer ses propres tâches

---

## Phase 6: Déployer

```bash
# Commiter
git add -A
git commit -m "Intégrer RoleBasedDashboard dans le dashboard principal"

# Pousser
git push origin claude/check-app-access-ADXrd

# Puis pousser vers main quand prêt
git push origin main
```

Le déploiement Vercel se fera automatiquement.

---

## Commandes SQL Utiles

### Voir tous les rôles
```sql
SELECT user_id, role FROM user_roles;
```

### Voir les plans d'un chantier
```sql
SELECT * FROM plans WHERE chantier_id = 'chantier-id';
```

### Voir tous les reportages photos
```sql
SELECT * FROM photo_reports ORDER BY created_at DESC;
```

### Ajouter un salarié à un chantier
```sql
UPDATE chantiers
SET salarie_ids = array_append(salarie_ids, 'salarie-id')
WHERE id = 'chantier-id';
```

---

## Troubleshooting

### Problème: "Permission denied" sur plans/photos
→ Vérifier RLS policies dans SQL Editor

### Problème: Les clients ne voient pas leurs chantiers
→ Vérifier que `client_id` est défini dans la table chantiers

### Problème: Les salariés ne voient pas leurs chantiers
→ Vérifier que leur ID est dans le tableau `salarie_ids`

### Problème: Les photos ne s'affichent pas
→ Vérifier que le bucket Storage **documents** existe et a les bonnes permissions

---

## Prochaines étapes

Une fois déployé, vous pouvez:
1. ✅ Gérer les accès utilisateurs facilement
2. ✅ Stocker des plans PDF par chantier
3. ✅ Créer des reportages photos organisés
4. ✅ Audit trail automatique (created_by_prenom, updated_by_prenom)
5. ✅ Isolation des données par rôle
