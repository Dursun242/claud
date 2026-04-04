# ✅ Phase 1 - Vérification & Correction Complète

**Date:** 2026-04-04  
**Objectif:** S'assurer que toutes les migrations SQL sont correctement déployées

---

## 🔧 Étape par Étape

### **ÉTAPE 1: Accéder à Supabase SQL Editor**

1. Allez sur https://app.supabase.com
2. Sélectionnez votre projet
3. **SQL Editor** (menu de gauche)
4. Cliquez sur **"New Query"**

---

### **ÉTAPE 2: Exécuter le script de vérification**

1. Copier le contenu de: `VERIFY_PHASE1.sql`
2. Coller dans le SQL Editor
3. Cliquer **"Run"**

**Attendus:**
```
✅ CLIENT_CHANTIERS TABLE: EXISTS
✅ RLS ENABLED: chantiers, compte_rendus, ordres_service, etc.
✅ CLIENT_CHANTIERS DATA: N mappings
✅ PHASE 1 STATUS: COMPLETE - Ready to deploy
```

---

### **ÉTAPE 3: Si client_chantiers n'existe PAS**

**Exécutez la migration 004:**

1. Créez une **nouvelle requête**
2. Copier TOUT le contenu de: `migrations/004_phase1_security_client_access_rls.sql`
3. Cliquez **"Run"**

**Attendus:**
- ✅ Pas d'erreurs
- ✅ Table créée
- ✅ Policies ajoutées

---

### **ÉTAPE 4: Si les données ne sont pas mappées**

**Exécutez la migration 005:**

1. Créez une **nouvelle requête**
2. Copier TOUT le contenu de: `migrations/005_migrate_client_data_to_client_chantiers.sql`
3. Cliquez **"Run"**

**Attendus:**
- ✅ Le SELECT final montre les mappings
- ✅ Exemple: `total_mappings: 5, unique_clients: 2, unique_chantiers: 3`

---

### **ÉTAPE 5: Vérifier les données mappées**

Si le SELECT final de migration 005 montre `0 mappings`:

**Exécutez cette requête:**

```sql
SELECT c.id, c.nom, c.client, COUNT(cc.id) as mapped
FROM chantiers c
LEFT JOIN client_chantiers cc ON cc.chantier_id = c.id
GROUP BY c.id, c.nom, c.client
ORDER BY mapped DESC;
```

**Résultats possibles:**

**A) Tous les chantiers ont des mappings (mapped > 0)** ✅
→ Allez à ÉTAPE 6

**B) Certains chantiers n'ont pas de mappings (mapped = 0)** ⚠️
→ Allez à ÉTAPE 5B (mapping manuel)

**C) Aucun client trouvé (tous mapped = 0)** ❌
→ Allez à ÉTAPE 5C (vérifier les clients)

---

### **ÉTAPE 5B: Mapper les chantiers manquants**

Si vous avez des chantiers sans mappings:

```sql
-- 1. D'abord, voir quels clients existent
SELECT id, email, prenom, nom, role
FROM authorized_users
WHERE role = 'client' AND actif = true
ORDER BY prenom;

-- 2. Ensuite, mapper manuellement
-- Exemple: Mapper "Villa Sainte-Adresse" (client: "M. Durand") 
-- au client avec email "durand@mail.fr"

INSERT INTO client_chantiers (client_id, chantier_id, created_by_email, created_at)
SELECT
  au.id,
  c.id,
  'admin@system.local',
  NOW()
FROM authorized_users au, chantiers c
WHERE au.email = 'durand@mail.fr'  -- ← Remplacer par le vrai email
  AND c.nom = 'Villa Sainte-Adresse'  -- ← Ou c.id = 'uuid-du-chantier'
  AND NOT EXISTS (
    SELECT 1 FROM client_chantiers cc
    WHERE cc.client_id = au.id AND cc.chantier_id = c.id
  );
```

Répéter pour chaque mapping manquant.

---

### **ÉTAPE 5C: Si aucun client n'existe**

```sql
-- Vérifier les utilisateurs
SELECT email, role, actif FROM authorized_users;

-- Si aucun client, en créer un
INSERT INTO authorized_users (email, prenom, nom, role, actif)
VALUES (
  'client@example.com',
  'Prénom',
  'Nom',
  'client',
  true
);
```

---

### **ÉTAPE 6: Tester les RLS Policies**

#### **Test 6A: Authentification Admin**

```sql
-- Se connecter comme admin
-- Dans la top-right: cliquez sur votre email → "Settings" → copier votre User UUID

-- Puis exécuter (en remplaçant l'UUID):
SELECT * FROM chantiers;
-- ✅ Devrait voir TOUS les chantiers
```

#### **Test 6B: Authentification Client**

```sql
-- Se connecter comme client
-- Puis exécuter:
SELECT c.* 
FROM chantiers c
WHERE EXISTS (
  SELECT 1 FROM client_chantiers cc
  JOIN authorized_users u ON u.id = cc.client_id
  WHERE u.email = auth.jwt()->>'email'
  AND cc.chantier_id = c.id
);
-- ✅ Devrait voir UNIQUEMENT ses chantiers
```

---

### **ÉTAPE 7: Vérifier authorized_users**

```sql
-- Voir qui peut voir autorités
SELECT email, role, actif FROM authorized_users;

-- Vous devriez voir:
-- ✅ idconseil76@gmail.com (admin)
-- ✅ Autres comptes clients/salariés
```

---

### **ÉTAPE 8: Tester l'API Frontend**

1. Lancer l'app en local: `npm run dev`
2. Aller à http://localhost:3000
3. **Connecté comme Admin (idconseil76@gmail.com):**
   - [ ] Accueil charge
   - [ ] Onglet "Tableau de bord" montre tous les chantiers
   - [ ] Peut créer un nouveau chantier

4. **Déconnectez-vous et connectez-vous comme Client:**
   - [ ] Accueil charge
   - [ ] Onglet "Tableau de bord" montre UNIQUEMENT ses chantiers
   - [ ] NE PEUT PAS créer de chantiers

---

## 🚨 Erreurs Communes & Solutions

### **Erreur: "RLS policy conflicts"**
```sql
-- Solution: Supprimer l'ancienne policy
DROP POLICY IF EXISTS "policy_name" ON table_name;
-- Puis réexécuter la migration
```

### **Erreur: "Table already exists"**
```sql
-- C'est OK! Ça signifie que la migration a déjà été exécutée
-- Continuez à la prochaine étape
```

### **Erreur: "Invalid input syntax"**
- Vérifier que vous avez copié TOUT le SQL
- Pas de retours à la ligne manquants
- Pas de commentaires mal fermés

### **Client voit toujours tous les chantiers**
```sql
-- Vérifier que la policy existe:
SELECT policyname FROM pg_policies
WHERE tablename = 'chantiers' AND policyname LIKE '%client%';

-- Si vide, réexécuter la migration 004
```

---

## ✅ Checklist de Validation

- [ ] Table `client_chantiers` existe
- [ ] RLS activé sur: chantiers, compte_rendus, ordres_service
- [ ] Au moins 1 mapping dans `client_chantiers`
- [ ] Admin voit tous les chantiers
- [ ] Client voit uniquement ses chantiers
- [ ] API routes acceptent les requêtes
- [ ] Frontend charge correctement

---

## 📞 Si vous êtes bloqué

1. **Vérifiez les logs Supabase:**
   - Console → Logs → Database

2. **Exécutez VERIFY_PHASE1.sql** complet pour voir le status

3. **Si RLS cause des problèmes:**
   ```sql
   -- Désactiver temporairement pour tester
   ALTER TABLE chantiers DISABLE ROW LEVEL SECURITY;
   -- Puis voir si ça marche
   ```

---

**Créé:** 2026-04-04  
**Status:** 🚀 À Tester
