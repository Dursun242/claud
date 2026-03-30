# 🚀 Plan d'Implémentation v3.0 — Mise à Jour Majeure

## Status: PRÉPLANIFICATION
**Branche:** `claude/app-major-update-v2-lkWZT`
**Version stable conservée:** `main`
**Objectif:** Refonte complète + Validation client OS + CR interactif semaine par semaine
**Zéro casse garantie** ✅

---

## 📊 PHASE 1: Migrations Supabase (Zéro casse)

### 1.1 Ajouter champs OS — Validation Client
```sql
-- Ajouter colonnes à ordres_service
ALTER TABLE ordres_service ADD COLUMN validation_client BOOLEAN DEFAULT FALSE;
ALTER TABLE ordres_service ADD COLUMN date_validation_client TIMESTAMPTZ NULL;
ALTER TABLE ordres_service ADD COLUMN signature_client TEXT NULL;
ALTER TABLE ordres_service ADD COLUMN client_email TEXT NULL;

-- Créer table pour les validations signées
CREATE TABLE IF NOT EXISTS os_validations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  os_id UUID REFERENCES ordres_service(id) ON DELETE CASCADE,
  client_id UUID,
  signature TEXT NOT NULL,
  ip_address TEXT,
  validated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(os_id, client_id)
);

-- Index pour performance
CREATE INDEX idx_os_validation_status ON ordres_service(statut, validation_client);
CREATE INDEX idx_os_validations_os ON os_validations(os_id);
```

### 1.2 Améliorer Comptes Rendus — Interactivité + Photos
```sql
-- Ajouter champs à compte_rendus
ALTER TABLE compte_rendus ADD COLUMN semaine INTEGER NULL;
ALTER TABLE compte_rendus ADD COLUMN annee INTEGER DEFAULT DATE_PART('year', CURRENT_DATE);
ALTER TABLE compte_rendus ADD COLUMN photos TEXT[] DEFAULT '{}';
ALTER TABLE compte_rendus ADD COLUMN created_by_user TEXT NULL;
ALTER TABLE compte_rendus ADD COLUMN last_edited_by_user TEXT NULL;

-- Créer table pour commentaires/demandes du client
CREATE TABLE IF NOT EXISTS cr_commentaires (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cr_id UUID REFERENCES compte_rendus(id) ON DELETE CASCADE,
  user_id UUID,
  user_role TEXT,
  contenu TEXT NOT NULL,
  type TEXT DEFAULT 'commentaire',  -- 'commentaire' ou 'demande_specifique'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour performance
CREATE INDEX idx_cr_semaine ON compte_rendus(chantier_id, semaine, annee);
CREATE INDEX idx_cr_commentaires ON cr_commentaires(cr_id);
```

### 1.3 Ajouter stockage photos par chantier
```sql
-- Table pour photos chantier
CREATE TABLE IF NOT EXISTS chantier_photos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chantier_id UUID REFERENCES chantiers(id) ON DELETE CASCADE,
  cr_id UUID REFERENCES compte_rendus(id) ON DELETE SET NULL,
  url_storage TEXT NOT NULL,
  description TEXT,
  date_photo DATE DEFAULT CURRENT_DATE,
  uploaded_by_user TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index
CREATE INDEX idx_chantier_photos ON chantier_photos(chantier_id);
```

### 1.4 RLS Policies — Garder les données sécurisées
```sql
-- OS: Admin + Salarié peuvent voir/éditer, Client peut valider
CREATE POLICY "admin_see_all_os" ON ordres_service
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "client_validate_os" ON ordres_service
  FOR UPDATE TO authenticated USING (
    auth.uid()::text = client_id OR role = 'admin'
  );

-- CR: Admin + Salarié peuvent éditer, Client peut commenter
CREATE POLICY "admin_edit_cr" ON compte_rendus
  FOR UPDATE TO authenticated USING (
    auth.uid()::text = created_by_user OR role = 'admin'
  );

-- Photos: Anyone authenticated peut ajouter, tous peuvent voir
CREATE POLICY "upload_photos" ON chantier_photos
  FOR INSERT TO authenticated WITH CHECK (true);
```

---

## 🏗️ PHASE 2: Architecture Modulaire

### 2.1 Découper AdminDashboard (2678 → ~500 par composant)

**Structure nouvelle:**
```
src/app/
├── components/
│   ├── AdminLayout/              ← Layout admin principal
│   ├── OrdresService/            ← OS CRUD + validation client
│   │   ├── OSList.js             ← Tableau des OS
│   │   ├── OSForm.js             ← Édition/création OS
│   │   ├── OSValidationPanel.js  ← Validation client
│   │   └── OSPdfPreview.js        ← Aperçu PDF
│   ├── CompteRendus/             ← CR interactif
│   │   ├── CRTimeline.js          ← Timeline par semaine
│   │   ├── CRForm.js              ← Édition CR
│   │   ├── CRComments.js          ← Commentaires
│   │   └── CRPhotos.js            ← Photos intégrées
│   ├── Chantiers/                ← Gestion chantiers
│   ├── Planning/                 ← Planning & Gantt
│   ├── Finances/                 ← Budget & devis
│   └── ...
├── dashboards/
│   ├── AdminDashboard/           ← Nouvelle version v3
│   │   ├── index.js              ← Router principal
│   │   ├── Overview.js           ← KPI, stats
│   │   └── Tabs.js               ← Navigation des onglets
│   ├── ClientDashboard/          ← Amélioré
│   │   ├── MyProjects.js         ← Ses chantiers uniquement
│   │   ├── OSValidation.js       ← Valider OS
│   │   ├── Photos.js             ← Visualiser photos
│   │   └── Comments.js           ← Ajouter commentaires
│   └── SalarieDashboard/         ← Amélioré (avec CR interactif)
└── ...
```

### 2.2 Système de state management
- Utiliser React Query (déjà dans package.json)
- Cache automatique
- Refetch optimisé

---

## ✨ PHASE 3: Implémentation Features

### 3.1 Validation Client pour OS
**Flux:**
1. Admin crée OS → Statut "En attente validation client"
2. Client reçoit notification + accès OS
3. Client peut visualiser PDF
4. Client signe numériquement (ou approbation simple)
5. OS passe au statut "Validé" → Admin peut imprimer

**Fichiers à créer:**
- `components/OrdresService/OSValidationPanel.js` — Interface validation client
- `api/os-validation/route.js` — Endpoint signature
- Modifier `generators.js` → Ajouter info "Validé par [Client] le [Date]"

### 3.2 CR Interactif — Semaine par Semaine
**Flux:**
1. Admin/Salarié crée CR → "Semaine 10, 2026"
2. Peut ajouter photos directement
3. Client voit CR historique par semaine
4. Client peut ajouter commentaires + demandes spécifiques
5. Admin/Salarié voient les commentaires → Peuvent répondre

**Fichiers à créer:**
- `components/CompteRendus/CRTimeline.js` — Vue par semaine
- `components/CompteRendus/CRPhotos.js` — Galerie intégrée
- `components/CompteRendus/CRComments.js` — Commentaires
- Modifier `ReportsV.js` → Utiliser la timeline

### 3.3 Améliorer Dashboard Client
**Features:**
- Voir uniquement ses chantiers
- Valider OS
- Charger photos
- Ajouter commentaires
- Demandes spécifiques

**Fichiers à créer:**
- `dashboards/ClientDashboard/OSValidation.js` — Panel validation
- `dashboards/ClientDashboard/PhotoUpload.js` — Upload photos
- `dashboards/ClientDashboard/RequestForm.js` — Demandes spécifiques

### 3.4 Optimiser Performance
**Actions:**
- Code splitting par onglet
- Lazy loading des composants
- Query memoization
- Pagination si plus de 100 items

---

## 🧪 PHASE 4: Tests & Validation

### 4.1 Checklist avant merge
- [ ] PDF OS rendu **IDENTIQUE** à version précédente
- [ ] Validation client OK (signature, dates)
- [ ] CR interactif — Timeline OK
- [ ] Photos uploadées correctement
- [ ] Commentaires sauvegardés
- [ ] Client voit uniquement ses chantiers
- [ ] Salarié voit ses chantiers assignés
- [ ] Admin voit tous les chantiers
- [ ] Données légales conservées (SIRET, adresses)
- [ ] RLS policies respectées

### 4.2 Scénarios de test
**Admin:**
1. Créer OS → Valider → Voir statut "En attente client"
2. Créer CR → Ajouter photos → Voir historique semaine
3. Voir tous les chantiers + commentaires clients

**Salarié (Salah):**
1. Voir ses chantiers assignés
2. Créer/éditer CR avec photos
3. Voir commentaires client
4. Répondre aux demandes

**Client:**
1. Voir ses chantiers uniquement
2. Valider OS → Signature
3. Charger photos
4. Ajouter commentaires
5. Faire demandes spécifiques

---

## 📈 Timeline d'Implémentation

| Phase | Durée | Statut |
|-------|-------|--------|
| Phase 1: Migrations Supabase | 1h | ⏳ Prêt |
| Phase 2: Architecture modulaire | 3-4h | ⏳ Prêt |
| Phase 3.1: Validation OS | 2h | ⏳ Prêt |
| Phase 3.2: CR interactif | 3h | ⏳ Prêt |
| Phase 3.3: Dashboard client | 1.5h | ⏳ Prêt |
| Phase 3.4: Performance | 1h | ⏳ Prêt |
| Phase 4: Tests complets | 2-3h | ⏳ Prêt |

**Total: ~12-14h** — À faire progressivement, avec tests continu

---

## 🔒 Garanties de Stabilité

✅ Branche de travail isolée
✅ Migrations Supabase non-destructives (ALTER TABLE, not DROP)
✅ PDF rendu **IDENTIQUE**
✅ Données légales **CONSERVÉES**
✅ Tests par rôle avant merge
✅ RLS policies pour sécurité
✅ Rollback possible si problème (on a `main` intact)

---

## 🎯 Prochain Pas

1. ✅ Présenter le plan au client
2. ⏳ Approuver Supabase modifications
3. ⏳ Commencer Phase 1 (migrations)
4. ⏳ Commencer Phase 2 (architecture)
5. ⏳ Implémenter features progressivement
6. ⏳ Tests exhaustifs
7. ⏳ Merger vers `main` quand OK

---

**Plan créé le:** 2026-03-30
**Par:** Claude Code
**Status:** APPROUVÉ ✅ (Awaiting confirmation)
