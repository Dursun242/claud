# 🔍 Comment Vérifier que Phase 1 est Correctement Déployée

**Durée:** ~10-15 minutes  
**Objectif:** S'assurer que toutes les migrations SQL sont en place et fonctionnelles

---

## 📋 Checklist Rapide

- [ ] Migrations SQL exécutées dans Supabase
- [ ] Table `client_chantiers` créée
- [ ] RLS policies en place
- [ ] Données mappées
- [ ] Tests JavaScript passent
- [ ] Frontend fonctionne

---

## 🔧 Plan de Vérification (3 étapes)

### **Étape A: Vérifier dans Supabase SQL Editor** (5 min)

1. **Allez sur:** https://app.supabase.com → Votre projet → SQL Editor

2. **Créez une nouvelle requête**

3. **Copier-collez le contenu de:** `VERIFY_PHASE1.sql`

4. **Cliquez "Run"**

**Regarder les résultats:**
```
✅ CLIENT_CHANTIERS TABLE: EXISTS
✅ RLS ENABLED: chantiers, compte_rendus, ordres_service, etc.
✅ CLIENT_CHANTIERS DATA: X mappings (si > 0, c'est bon)
✅ PHASE 1 STATUS: COMPLETE - Ready to deploy
```

**Si quelque chose manque:**
- Voir: `PHASE1_VERIFICATION_GUIDE.md` → ÉTAPE 3 ou 4

---

### **Étape B: Tester dans le Frontend** (5 min)

1. **Démarrez l'app:**
   ```bash
   npm run dev
   ```

2. **Ouvrez:** http://localhost:3000

3. **Connectez-vous comme ADMIN** (idconseil76@gmail.com)
   - [ ] La page charge
   - [ ] Onglet "Tableau de bord" affiche tous les chantiers
   - [ ] Pouvez créer/éditer un chantier

4. **Déconnectez-vous (logout)**

5. **Connectez-vous comme CLIENT** (autre compte)
   - [ ] La page charge
   - [ ] Onglet "Tableau de bord" affiche UNIQUEMENT ses chantiers
   - [ ] NE PEUT PAS créer/éditer les chantiers

---

### **Étape C: Tester avec JavaScript** (5 min)

1. **Assurez-vous que l'app fonctionne:** `npm run dev` en local

2. **Ouvrez DevTools:** F12 ou Cmd+Option+I

3. **Allez à l'onglet "Console"**

4. **Copier-collez le contenu de:** `phase1-tests.js`

5. **Appuyez sur Enter**

6. **Lancez les tests:**
   ```javascript
   runPhase1Tests()
   ```

**Attendus:**
```
✅ Supabase Auth: Connected as ...
✅ authorized_users Table: Table exists and accessible
✅ client_chantiers Table: Table exists and accessible
✅ Chantiers RLS: Retrieved X chantiers
✅ Compte Rendus RLS: Retrieved X records
✅ User Profile: email@example.com (role)
✅ Client Chantiers JOIN: Retrieved X mappings with JOINs

🎉 ALL TESTS PASSED! Phase 1 is ready.
```

---

## ❌ Si quelque chose ne marche pas

### **Problème 1: "client_chantiers table missing"**

**Solution:**
1. Allez dans Supabase SQL Editor
2. Créez une nouvelle requête
3. Copier-collez TOUT le contenu de: `migrations/004_phase1_security_client_access_rls.sql`
4. Cliquez "Run"
5. Relancez les tests

### **Problème 2: "RLS disabled on tables"**

**Solution:**
1. Allez dans Supabase SQL Editor
2. Exécutez:
```sql
ALTER TABLE chantiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE compte_rendus ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordres_service ENABLE ROW LEVEL SECURITY;
```
3. Puis relancez la migration 004

### **Problème 3: "No data in client_chantiers"**

**Solution:**
1. Allez dans Supabase SQL Editor
2. Créez une nouvelle requête
3. Copier-collez TOUT le contenu de: `migrations/005_migrate_client_data_to_client_chantiers.sql`
4. Cliquez "Run"
5. Vérifiez le SELECT final pour voir le nombre de mappings

### **Problème 4: "Client sees all chantiers (RLS not working)"**

**Diagnostic:**
1. Exécutez VERIFY_PHASE1.sql
2. Regardez la section "RLS POLICIES"
3. Vérifiez que les policies existent

**Solution:**
```sql
-- Supprimer les anciennes policies
DROP POLICY IF EXISTS "chantiers_client_select" ON chantiers;

-- Réexécuter la migration 004
```

### **Problème 5: "Tests fail with auth errors"**

**Solution:**
1. Assurez-vous que vous êtes **connecté** à l'app (`http://localhost:3000`)
2. Sinon les tests n'auront pas de token
3. Essayez de vous reconnecter
4. Puis relancez les tests

---

## 📊 Exemple de Résultats Corrects

### **Admin voit tous les chantiers:**
```sql
SELECT COUNT(*) FROM chantiers;
-- Résultat: 6 (ou nombre total de chantiers)
```

### **Client voit uniquement ses chantiers:**
```sql
SELECT COUNT(*) FROM chantiers
WHERE EXISTS (
  SELECT 1 FROM client_chantiers cc
  WHERE cc.chantier_id = chantiers.id
  AND cc.client_id = (SELECT id FROM authorized_users WHERE email = 'client@example.com')
);
-- Résultat: 1-2 (seulement ses chantiers assignés)
```

---

## 🚀 Quand Allez-Vous à Phase 2?

**SEULEMENT si:**
- ✅ Table `client_chantiers` existe
- ✅ RLS activé sur au moins 5 tables
- ✅ Au moins 1 mapping dans `client_chantiers`
- ✅ Les tests JavaScript passent
- ✅ Frontend fonctionne correctement

---

## 📞 Commandes Rapides

```bash
# Démarrer l'app
npm run dev

# Compiler et vérifier les erreurs
npm run build

# Ouvrir DevTools (avec l'app active)
# Mac: Cmd + Option + I
# Windows: F12
```

---

**Créé:** 2026-04-04  
**Statut:** 🚀 À Vérifier
