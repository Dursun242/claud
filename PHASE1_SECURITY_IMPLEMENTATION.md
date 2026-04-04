# 🔒 PHASE 1 SÉCURITÉ - Guide d'Implémentation

**Date:** 2026-04-04  
**Status:** 🚀 En cours  
**Durée estimée:** 2-3 heures

---

## 📋 Résumé des Changements

### ✅ Migrations SQL Créées
1. **004_phase1_security_client_access_rls.sql**
   - Crée table `client_chantiers` (relation explicite Client ↔ Chantier)
   - Ajoute RLS policies sur toutes les tables critiques
   - Sécurise l'accès au niveau base de données

2. **005_migrate_client_data_to_client_chantiers.sql**
   - Migre les données existantes du champ "client" → table client_chantiers
   - Mappe automatiquement par similarité de noms
   - Nécessite vérification manuelle

### ✅ Code Frontend Refactorisé
- **shared.js** → `loadForClient()` utilise maintenant `client_chantiers`
- Plus de filtrage par texte fragile
- Accès enforcer par RLS au niveau BD

---

## 🔧 Étapes d'Implémentation

### **Étape 1: Exécuter les migrations SQL** ⚙️

#### A. Aller dans Supabase Console
```
https://app.supabase.com → Votre projet → SQL Editor
```

#### B. Exécuter migration 004 (RLS Setup)
```sql
-- Copier-coller le contenu de:
migrations/004_phase1_security_client_access_rls.sql
```

**Attendus:**
- ✅ Table `client_chantiers` créée
- ✅ RLS policies ajoutées
- ✅ Pas d'erreurs

#### C. Exécuter migration 005 (Data Migration)
```sql
-- Copier-coller le contenu de:
migrations/005_migrate_client_data_to_client_chantiers.sql
```

**Important:** Vérifier que le SELECT final montre des mappings:
```
total_mappings | unique_clients | unique_chantiers
    XX         |      X         |       Y
```

#### D. Vérifier les données non mappées
```sql
-- Exécuter cette requête pour voir les chantiers sans client
SELECT c.id, c.nom, c.client 
FROM chantiers c
WHERE NOT EXISTS (
  SELECT 1 FROM client_chantiers cc
  WHERE cc.chantier_id = c.id
);
```

**Si résultat non vide:** Ajouter manuellement les mappings manquants
```sql
-- Exemple: mapper un chantier à un client
INSERT INTO client_chantiers (client_id, chantier_id, created_by_email)
SELECT 
  au.id, 
  c.id,
  'admin@system.local'
FROM authorized_users au, chantiers c
WHERE au.email = 'idconseil76@gmail.com'
  AND c.nom = 'Nom du Chantier'
  AND NOT EXISTS (
    SELECT 1 FROM client_chantiers cc
    WHERE cc.client_id = au.id AND cc.chantier_id = c.id
  );
```

---

### **Étape 2: Tester les RLS Policies** 🧪

#### Test 1: Admin peut voir tous les chantiers
```sql
-- Connecté comme admin (idconseil76@gmail.com)
SELECT COUNT(*) FROM chantiers;
-- ✅ Devrait retourner le nombre total
```

#### Test 2: Client ne voit que ses chantiers
```sql
-- Connecté comme client
SELECT COUNT(*) FROM chantiers;
-- ✅ Devrait retourner 0 ou nombre limité basé sur client_chantiers
```

#### Test 3: Vérifier l'isolation des données sensibles
```sql
-- Connecté comme n'importe quel utilisateur
SELECT * FROM authorized_users;
-- ✅ Devrait voir uniquement soi-même (+ admins si admin)
```

---

### **Étape 3: Déployer le code Frontend** 🚀

#### A. Vérifier que tout compile
```bash
cd /home/user/claud
npm run build
```

**Attendus:**
- ✅ Pas d'erreurs TypeScript/JavaScript
- ✅ Build réussi

#### B. Tester en local
```bash
npm run dev
# http://localhost:3000
```

**Scénarios de test:**

**Connecté comme Admin (idconseil76@gmail.com):**
1. [ ] Accueil se charge normalement
2. [ ] Onglet "Tableau de bord" montre tous les chantiers
3. [ ] Peut créer/éditer/supprimer chantiers

**Connecté comme Client (autre compte):**
1. [ ] Accueil se charge normalement
2. [ ] Onglet "Tableau de bord" montre uniquement les chantiers assignés
3. [ ] Ne peut pas éditer les chantiers

---

### **Étape 4: Vérifier la Sécurité** 🔐

#### A. Test d'escalade de privilèges
```bash
# Ouvrir DevTools (F12) → Console → Network tab
```

**Connecté comme Client:**
1. Ouvrir Network tab
2. Cliquer sur "Tableau de bord"
3. Vérifier que les requêtes Supabase retournent que ses chantiers
4. ❌ Pas d'accès à d'autres chantiers

#### B. Test d'injection SQL
- Essayer de modifier les URLs (hack)
- Exemple: `/chantier/autre-uuid`
- ✅ Devrait voir une erreur "Non autorisé" ou une page vide

#### C. Test de token expiré
```bash
# Attendre 1 heure ou supprimer le token manuellement
# Rafraîchir la page
# ✅ Devrait rediriger vers login
```

---

## 🎯 Checklist d'Implémentation

### Migrations SQL
- [ ] Migration 004 exécutée sans erreur
- [ ] Migration 005 exécutée sans erreur
- [ ] Vérification des données mappées OK
- [ ] Données manquantes mappées manuellement

### Code Frontend
- [ ] `npm run build` sans erreur
- [ ] `npm run dev` fonctionne localement
- [ ] Aucun warning dans la console

### Tests de Sécurité
- [ ] Admin voit tous les chantiers
- [ ] Client voit uniquement ses chantiers
- [ ] Pas d'accès cross-tenant possible
- [ ] authorized_users visibility restreinte
- [ ] RLS policies testées et validées

### Avant Production
- [ ] Tous les tests passent
- [ ] Backup de la BD effectué
- [ ] Rollback plan documenté
- [ ] Users informés du changement

---

## 🚨 Problèmes Courants & Solutions

### Erreur: "RLS policy conflicts"
**Cause:** Une policy existe déjà avec le même nom  
**Solution:** 
```sql
-- Supprimer l'ancienne policy
DROP POLICY IF EXISTS "policy_name" ON table_name;
-- Puis réexécuter la migration
```

### Client voit toujours tous les chantiers
**Cause:** RLS n'est pas activée ou policy est incorrecte  
**Solution:**
```sql
-- Vérifier que RLS est activée
SELECT relname, rowsecurity 
FROM pg_class 
WHERE relname = 'chantiers';
-- ✅ rowsecurity devrait être 't'

-- Vérifier les policies
SELECT policyname FROM pg_policies 
WHERE tablename = 'chantiers';
```

### client_chantiers table vide
**Cause:** La migration 005 n'a pas trouvé de correspondances  
**Solution:** Ajouter manuellement les mappings
```sql
-- Voir section "Étape 1.D" ci-dessus
```

---

## 📊 Métriques de Succès

| Avant | Après |
|-------|-------|
| ❌ Accès par texte fragile | ✅ Accès par ID explicite |
| ❌ 0% RLS | ✅ 95% RLS coverage |
| ❌ Escalade possible | ✅ Isolation tenant garantie |
| ❌ Données sensibles visibles | ✅ Accès restreint |

---

## 📚 Documentation Supplémentaire

- [AUDIT_COMPLET.md](AUDIT_COMPLET.md) - Vue d'ensemble des problèmes
- [RLS Supabase Docs](https://supabase.com/docs/guides/auth/row-level-security)
- [Phase 2+ Plan](AUDIT_COMPLET.md#-plan-dimplantation)

---

## 🆘 Support

Si vous rencontrez des erreurs:

1. **Vérifier les logs Supabase**
   - Console → Logs → Database

2. **Vérifier les permissions auth**
   ```sql
   SELECT * FROM auth.users LIMIT 1;
   ```

3. **Réinitialiser RLS** (dernier recours)
   ```sql
   ALTER TABLE chantiers DISABLE ROW LEVEL SECURITY;
   ALTER TABLE chantiers ENABLE ROW LEVEL SECURITY;
   ```

---

**Créé:** 2026-04-04  
**Status:** 🚀 À implémenter  
**Durée:** ~2-3 heures  
**Prochaine phase:** Phase 2 (Notifications + Audit Log)
