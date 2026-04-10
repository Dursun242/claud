# ✅ Checklist v3.0 - Tests & Validation

## 📋 État du Système

### Services Supabase
- [x] osService — CRUD OS + validation client
- [x] crService — CRUD CR + commentaires + timeline
- [x] photoService — Upload + compression + métadonnées

### Composants React
- [x] OSValidationPanel — Validation client (checkbox + date)
- [x] CRTimeline — Timeline CR par semaine
- [x] CRComments — Commentaires/demandes clients
- [x] PhotoUploader — Upload photos avec compression
- [x] OSForm — Formulaire complet OS

### Pages v3
- [x] OrdresServiceV3 — Liste + détail + validation + PDF
- [x] CompteRendusV3 — Création + timeline + photos

### Base de Données Supabase
- [x] Migrations exécutées (colonnes + tables)
- [ ] Bucket `chantier-photos` créé (MANUEL)
- [ ] RLS policies configurées

---

## 🧪 Tests à Effectuer

### Test 1: Admin — Gestion complète OS
**Étapes:**
1. Aller à OrdresServiceV3
2. Créer nouveau OS
3. Remplir tous les champs
4. Ajouter 3 prestations (différents TVA)
5. Vérifier calcul TTC
6. Télécharger PDF
7. **Vérifier:** PDF rendu IDENTIQUE à v2

**Données:**
- Numéro: OS-TEST-001
- Client: Acme Corp
- Artisan: BTP Solutions
- Prestation 1: Travaux HT - 1m² - 500€ - 20% TVA
- Prestation 2: Matériaux - 1lot - 200€ - 20% TVA
- Prestation 3: Nettoyage - 1fois - 50€ - 5.5% TVA

**Résultat attendu:**
- Total HT: 750€
- TVA: 149€
- Total TTC: 899€

---

### Test 2: Admin — Créer Compte Rendu
**Étapes:**
1. Aller à CompteRendusV3
2. Cliquer "Nouveau CR"
3. Remplir tous les champs
4. Ajouter 2 photos (test compression)
5. Vérifier semaine auto-calculée

**Données:**
- Date: [aujourd'hui]
- Résumé: "Coulage béton dalle RDC - OK"
- Participants: "Salah, Marcel"
- Décisions: "Suite prévue 15/04"

**Résultat attendu:**
- CR sauvegardé
- Photos compressées (regarder réduction %)
- Semaine automatiquement définie

---

### Test 3: Client — Validation OS
**Étapes:**
1. Changer rôle → Client
2. Aller à OrdresServiceV3
3. Cliquer sur OS en attente de validation
4. Cliquer "Valider"
5. Cocher checkbox + choisir date
6. Cliquer "Valider"

**Résultat attendu:**
- ✅ Validé
- Date de validation affichée
- Bouton "Valider" disparu
- BD mise à jour (validation_client = true)

---

### Test 4: Client — Ajouter Commentaire
**Étapes:**
1. Rôle = Client
2. Aller à CompteRendusV3
3. Ouvrir un CR
4. Ajouter commentaire "Demande: Retouche angles..."
5. Choisir type "Demande spécifique"

**Résultat attendu:**
- Commentaire affiché
- Badge "📋 Demande" visible
- Horodatage correct

---

### Test 5: Admin — Résoudre Demande
**Étapes:**
1. Rôle = Admin
2. Voir commentaire client
3. Cliquer "✓ Résoudre"

**Résultat attendu:**
- Status = "Résolu"
- Badge "✅ Résolu" affiché
- Bouton Résoudre disparu

---

### Test 6: Compression Photos
**Étapes:**
1. Uploader photo 2MB (JPG large)
2. Observer barre progression
3. Vérifier réduction % affichée
4. Vérifier photos chargées dans CR

**Résultat attendu:**
- Photo compressée à ~100-300KB
- Toujours lisible/claire
- Métadonnées sauvegardées (largeur, hauteur, tailles)

---

### Test 7: PDF Identique à v2
**Étapes:**
1. Admin: Créer OS avec plusieurs prestations
2. Cliquer "Télécharger PDF"
3. Comparer avec PDF v2 généré précédemment

**Vérifier:**
- Logo ID MAÎTRISE présent ✅
- En-têtes (adresse, SIRET) identiques ✅
- Titre "ORDRE DE SERVICE" en bleu ✅
- Numéro OS en bleu clair ✅
- Tableau prestations avec couleurs ✅
- Totaux HT/TVA/TTC correctement placés ✅
- Section signatures en bas ✅
- Pas de glitches de mise en page ✅

---

### Test 8: Timeline Semaine par Semaine
**Étapes:**
1. Créer 3 CR sur 3 semaines différentes
2. Aller CompteRendusV3
3. Vérifier sidebar semaines
4. Cliquer sur semaines différentes
5. Vérifier CR affichés correctement

**Résultat attendu:**
- Sidebar affiche toutes les semaines
- Sélection semaine = filtrage OK
- Ordre décroissant des CR
- Semaine auto-calculée correcte

---

## 🚀 Checks Techniques

### Avant Merger vers main
- [ ] Pas d'erreurs console JavaScript
- [ ] Pas d'erreurs Supabase
- [ ] PDF téléchargement OK
- [ ] Toutes migrations exécutées
- [ ] Bucket Storage créé
- [ ] RLS policies appliquées
- [ ] Tests les 3 rôles (admin, salarié, client)

### Performance
- [ ] Page OrdresServiceV3 charge < 2s
- [ ] Page CompteRendusV3 charge < 2s
- [ ] Upload photo < 5s (avec compression)
- [ ] PDF génération < 2s

### Rollback si Problème
- [ ] Version v2 intacte sur `main`
- [ ] Peut revenir si nécessaire
- [ ] Données non affectées (migrations non-destructives)

---

## 📝 Notes

**Admin:** Salah
**Client de test:** [À définir si besoin]
**Chantier de test:** [À définir]

---

## ✅ Signature d'approbation

- [ ] Tests effectués par: _____________
- [ ] Date: _____________
- [ ] Tous les tests PASSÉS
- [ ] Prêt pour MERGER vers main

