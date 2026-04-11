# ID Maîtrise — Dashboard de Gestion de Chantiers

**SARL ID MAITRISE** — Maîtrise d'œuvre BTP, Le Havre
9 Rue Henry Genestal, 76600 Le Havre

Application interne pour piloter le quotidien des chantiers : ordres de service, comptes rendus, annuaire artisans, planning, tâches, avec assistant IA, intégration Qonto (factures) et signature électronique Odoo Sign.

---

## Fonctionnalités principales

- **Tableau de bord** — Salutation horaire, KPIs (chantiers actifs, OS actifs, tâches urgentes, en retard), chantiers en cours, tâches à faire, budget global
- **Chantiers** — CRUD avec phases BTP (Avant-projet → Études → Gros œuvre → Hors d'air → Technique → Finitions), photo de couverture, lots, budget/dépenses, vue détail avec attachments, comptes rendus, tâches, intervenants, planning, notes internes, partage
- **Ordres de Service** — Formulaire complet (prestations, TVA, signataires), génération PDF/Excel, envoi email, signature Odoo Sign à 3 signataires (MOE/MOA/Entreprise), import par photo (Claude Vision extrait les infos d'un devis artisan)
- **Comptes Rendus** — CRUD, PDF/Excel, filtre par chantier, recherche étendue (résumé + participants)
- **Annuaire** — Artisans, clients, fournisseurs, MOA, architectes, BET. Recherche Pappers par SIRET/nom/dirigeant. Import photo (carte de visite, signature email, capture SMS, panneau de chantier…). Export CSV. Liens cliquables tel:/mailto: + copie SIRET/email en un clic
- **Tâches** — Liste avec priorité/statut, filtres en pills, détection auto "en retard", click-to-edit
- **Planning** — Vue Gantt par lot avec marqueur "aujourd'hui"
- **Qonto** — Factures, devis et clients lus via API v2 (lecture seule), analyse IA des factures, import client Qonto → Annuaire
- **Assistant IA** — Chat Claude qui peut créer chantiers/OS/CR/tâches/contacts via bloc action, reconnaissance vocale
- **Micro flottant néon** — Dictée vocale depuis n'importe quelle page, envoi direct à l'IA
- **Accessibilité** — Raccourcis clavier (`g+lettre` pour naviguer, `/` pour la recherche, `?` pour l'aide, `n` pour créer), focus-visible, ARIA landmarks, skip link, support prefers-reduced-motion, zoom autorisé
- **Mobile-first** — Responsive complet, modales en bottom-sheet, fix iOS auto-zoom inputs

---

## Stack technique

| Catégorie | Techno |
|---|---|
| **Framework** | Next.js 15.5.15 (App Router) |
| **UI** | React 18, styles inline (pas de Tailwind ni CSS Modules) |
| **State/cache** | @tanstack/react-query (partiel) + state local + context |
| **Base de données** | Supabase (PostgreSQL managé) + Row-Level Security |
| **Auth** | Supabase Auth avec Google OAuth |
| **PDF/Excel** | jsPDF + jspdf-autotable (lazy-loaded) |
| **IA** | Anthropic Claude (haiku-4.5) — assistant + vision |
| **Recherche entreprises** | Pappers API |
| **Banque** | Qonto API v2 (lecture seule) |
| **Signature électronique** | Odoo Sign |
| **Déploiement** | Vercel |

---

## Installation en local

### Prérequis

- Node.js 18+ (idéalement 20+)
- Un projet Supabase configuré (voir section DB plus bas)
- Les clés API des intégrations (voir `.env.example`)

### Étapes

```bash
# 1. Cloner le repo
git clone https://github.com/Dursun242/claud.git
cd claud

# 2. Installer les dépendances
npm install

# 3. Configurer les variables d'environnement
cp .env.example .env.local
# Éditer .env.local et remplir avec tes vraies valeurs

# 4. Lancer le serveur de dev
npm run dev
```

L'app est ensuite disponible sur [http://localhost:3000](http://localhost:3000).

### Commandes utiles

```bash
npm run dev     # Serveur de dev avec hot reload
npm run build   # Build de production
npm run start   # Lance le build de production
npm run lint    # Linting Next.js / ESLint
```

---

## Variables d'environnement

Le fichier [`.env.example`](./.env.example) liste et documente **toutes** les variables d'environnement nécessaires, groupées par intégration :

- **Supabase** (obligatoire) : URL, anon key, service role key
- **Anthropic Claude** (obligatoire pour l'IA et les imports photo)
- **Pappers** (obligatoire pour la recherche entreprises FR)
- **Odoo Sign** (optionnel — sans ça, la fonction "Signature OS" est désactivée)
- **App** : `NEXT_PUBLIC_APP_URL` pour le callback OAuth Google
- **Sentry** (optionnel — sans ça, le monitoring d'erreurs est désactivé)

**Note importante** sur le token Qonto : il n'est PAS dans les env vars. Il est saisi directement dans l'app (onglet Qonto) puis stocké dans la table `settings` de Supabase. Le serveur le relit à chaque appel via le service role key. Voir commit `421e218` pour le détail.

### Monitoring Sentry (optionnel mais recommandé en prod)

Si tu veux être alerté quand des erreurs se produisent en prod (plutôt que de les découvrir via WhatsApp ou pas du tout), configure Sentry :

1. Crée un compte sur [sentry.io](https://sentry.io) (gratuit jusqu'à 5000 erreurs/mois)
2. Crée un projet de type **Next.js**
3. Dans `.env.local` et dans Vercel, remplis :
   - `NEXT_PUBLIC_SENTRY_DSN` — le DSN fourni par Sentry
   - `SENTRY_ORG` et `SENTRY_PROJECT` — les slugs
   - `SENTRY_AUTH_TOKEN` — pour l'upload des source maps au build (sans ça, les stack traces en prod sont minifiées et illisibles)

Sans ces variables, Sentry est désactivé et l'app fonctionne exactement comme avant — aucune requête n'est envoyée, aucune info n'est captée.

L'intégration est dans `src/instrumentation.js` (server), `src/instrumentation-client.js` (client), et `src/app/components/ErrorBoundary.js` (capture des erreurs React).

---

## Base de données Supabase

### Schéma

Le schéma de base est dans `supabase-schema.sql`. Les migrations additionnelles sont dans `migrations/` :

| Migration | Contenu |
|---|---|
| `001_refonte_complete.sql` | Structure v3.0 des tables principales |
| `002_v3_validation_os_cr_interactif.sql` | Tables v3.0 (os_validations, cr_commentaires, chantier_photos) |
| `003_create_storage_bucket.sql` | Bucket Storage pour attachments |
| `004_fix_rls_security.sql` | Correctif initial RLS |
| `005_rls_proper.sql` | Modèle RLS propre par rôle (admin/salarié/client) |
| `006_performance_indexes.sql` | Index de performance complémentaires (voir `006_README.md`) |

Chaque migration est **idempotente** (`IF NOT EXISTS` / `CREATE OR REPLACE`) et peut être ré-exécutée sans risque.

Les migrations `supabase-migration-*.sql` à la racine sont plus anciennes (attachments, authorized_users, features, contacts-v2, settings) et déjà appliquées.

### Exécuter une migration

Dans Supabase Dashboard → SQL Editor → copier-coller le fichier `.sql` → Run.

### Rôles et RLS

| Rôle | Accès |
|---|---|
| `admin` | CRUD complet sur tout |
| `salarié` (ou `salarie`) | CRUD sauf delete admin-only |
| `client` (MOA) | Read-only sur ses propres chantiers (matching par prénom — à migrer vers `client_email`) |
| anonyme | Aucun accès |

---

## Déploiement sur Vercel

1. **Push le repo** sur GitHub
2. **Connecte le repo** dans [vercel.com](https://vercel.com) → Add New → Project
3. Framework détecté automatiquement : **Next.js**
4. **Ajoute toutes les variables d'environnement** dans Settings → Environment Variables (copier depuis ton `.env.local`)
5. **Deploy**

Chaque push sur `main` redéploie automatiquement.

### Domaine personnalisé

Vercel → Settings → Domains → ajouter `app.id-maitrise.com`.

---

## Architecture

```
src/app/
├── api/              # API routes (auth, claude, qonto, pappers, odoo, upload, extract-*)
├── components/       # Components réutilisables (Modal, Toast, Skeleton, FloatingMic, …)
├── contexts/         # React contexts (Toast, Confirm)
├── dashboards/       # Shell principal (AdminDashboard, ClientDashboard, shared.js)
├── hooks/            # Hooks métier (useAttachments, useCRUDOperations, useUndoableDelete, …)
├── lib/              # Helpers (validators, csv, odoo)
├── pages/            # Vues métier (DashboardV, ProjectsV, OrdresServiceV, ContactsV, …)
├── services/         # Services Supabase (crService, osService, photoService, supabaseService)
├── auth.js           # AuthProvider + LoginPage
├── layout.js         # Root layout Next.js
├── page.js           # Entry point, ProtectedApp
└── RootWrapper.js    # ToastProvider + ConfirmProvider
```

---

## Contribution

C'est un projet interne ID Maîtrise. Si tu veux contribuer ou reprendre le projet :

1. Lis ce README en entier
2. Lis le fichier [`docs/RELEASE_NOTES.md`](./docs/RELEASE_NOTES.md) pour comprendre l'historique
3. Lis [`docs/V3.0_RESUME.md`](./docs/V3.0_RESUME.md) pour la structure actuelle
4. Configure ton `.env.local` depuis `.env.example`
5. Lance `npm run dev` et commence

Pour toute question sur l'architecture ou les intégrations, les commentaires dans le code sont volontairement verbeux — ils expliquent le "pourquoi".

---

## Licence

Propriétaire — SARL ID MAITRISE. Tous droits réservés.
