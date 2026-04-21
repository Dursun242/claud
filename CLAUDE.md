# CLAUDE.md — Guide agent & onboarding technique

Document destiné à un agent IA (Claude Code / Cursor / etc.) ou à un dev qui arrive sur ce codebase. Lis ce fichier en premier.

## Contexte produit

Application de gestion de chantiers BTP pour **ID Maîtrise** (SARL, Le Havre). Deux rôles principaux :
- **Admin / Salarié** (maîtrise d'œuvre) — accès complet : chantiers, OS, CR, PV, contacts, Qonto, Assistant IA, admin users.
- **Client / MOA** (maître d'ouvrage) — accès restreint à SES chantiers uniquement.

## Stack

- **Next.js 15** (App Router) + **React 18**
- **Supabase** : Postgres + Auth OAuth Google + Storage + RLS strictes par rôle
- **Anthropic SDK** (Claude Haiku 4.5) : assistant IA + extraction vision (devis photo, contacts photo)
- **Odoo JSON-RPC** : signatures électroniques via module Sign
- **Qonto API** : import factures/devis (proxy read-only)
- **Pappers API** : enrichissement SIRET des contacts
- **Jest + @testing-library/react** : 248 tests, 10 s d'exécution

## Topologie

```
src/app/
├─ page.js                    → entrée app (AuthProvider + dashboard)
├─ layout.js                  → root layout + next/font DM Sans
├─ RootWrapper.js             → providers (Toast, Confirm, WebVitals)
├─ middleware.js              → headers sécurité (pas de CSP, voir "dette")
├─ auth.js                    → login + AuthProvider Supabase
│
├─ dashboards/
│   ├─ shared.js              ⚠ 720+ lignes. SB (CRUD), constants, icons, styles, widgets. À splitter un jour.
│   ├─ AdminDashboard.js      → shell admin + lazy-load pages
│   └─ ClientDashboard.js     → shell client + lazy-load pages
│
├─ pages/                     → 1 page = 1 onglet. DashboardV, ProjectsV, OrdresServiceV, ContactsV, AIV, ...
├─ components/                → briques UI réutilisables (Modal, Badge, Skeleton, OsCard, ChantierCard, PVRow...)
├─ contexts/                  → ToastContext + ConfirmContext (non-invasive, context split pour éviter re-renders)
├─ hooks/                     → useFloatingMic, useAttachments, useComments, useUndoableDelete, useSignaturesSync...
├─ lib/                       → auth, fetchWithRetry, odoo, validators, notifications, activityLog, chantierFinances
│
└─ api/                       → 23 routes. Pattern unique : verifyAuth() + createLogger() + mock-friendly.
    ├─ admin/*                → service role uniquement (users, demo-mode, reset-demo-data)
    ├─ claude/                → proxy Anthropic (rate limit 20/min/IP)
    ├─ odoo/*                 → signatures
    ├─ pv-reception/*         → flux PV métier
    ├─ extract-*/             → Claude Vision (devis + contacts)
    ├─ pappers, qonto         → proxies tiers
    └─ metrics/               → ingest Web Vitals (sendBeacon)
```

## Chargement initial (cold start)

Stage 1 = **critique** (chantiers, tasks, OS, CR) → 4 requêtes Supabase → dashboard rendu.
Stage 2 = **secondaires** (contacts, planning, rdv, counts PJ via RPC `chantier_attachment_counts`) → hydrate en arrière-plan.

Cf. `SB.loadCritical()` / `SB.loadSecondary()` dans `dashboards/shared.js`.

## Conventions & règles du projet

1. **Server-only pour les secrets** : `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ODOO_API_KEY`, `PAPPERS_API_KEY`, `qonto-token` n'apparaissent **jamais** dans le bundle client. Les appels tiers passent par les routes `/api/*`.
2. **Auth** : toute route `/api/*` non-admin (sauf `/api/metrics`, `/api/auth/google/callback`) fait `verifyAuth(request)` en premier. Retour 401 si absent.
3. **Logging** : routes modernes utilisent `createLogger('source')` (`lib/logger.js`). Certaines routes anciennes utilisent encore `console.error` — migration progressive.
4. **Toasts, jamais `alert()`** : `useToast()` dans les composants. `useFloatingMic` prend `onError` pour les erreurs hors-UI.
5. **Tests routes API** : env `node` via pragma `/** @jest-environment node */`. Mock deps via `jest.mock()`. Voir `api/qonto/__tests__/route.test.js` comme modèle canonique (gère `jest.resetModules()` pour caches module-level).
6. **Tests UI** : env `jsdom` par défaut. RTL + `userEvent`. Voir `components/os/__tests__/OsCard.test.js` comme modèle.
7. **Pas de `'use client'` sur les fichiers utilitaires purs** — réservé aux fichiers avec hooks/state.
8. **Éviter `<img>`** : utiliser `next/image` sauf pour data-URIs ou signed URLs à TTL court (cf. `components/AttachmentsSection.js` pour exemple avec `eslint-disable`).
9. **Ne JAMAIS pousser sur `main` sans autorisation explicite**. Branches feature : `claude/…` ou `feat/…`. Merger via PR ou fast-forward local sur demande.

## Commandes

```bash
npm install          # deps
npm run dev          # dev sur :3000
npm run build        # build prod
npm test             # Jest (248 tests, ~10 s)
npm test -- --ci src/app/api/qonto  # tests filtrés
npm run lint         # next lint
```

## Variables d'environnement

Voir `.env.example` à la racine. Minimum requis pour dev :
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (côté serveur)
- `ANTHROPIC_API_KEY` (pour AIV + extraction)

## Migrations DB

**Ordre critique** : voir `migrations/APPLY_ORDER.md`. Les migrations numérotées 001→021 s'appliquent dans l'ordre via le SQL Editor Supabase. Chaque migration ayant un impact non-trivial a un `<num>_README.md` dédié.

## Dette technique assumée

- **`shared.js` = 720+ lignes** → plan de split documenté dans `/docs/` (à créer).
- **Pas de CSP** → refacto styles inline → classes ou ajout nonces (~1 j).
- **Tests pages `*V.js`** absents (seulement composants, hooks, routes API).
- **Pas d'i18n** → tout en français dur (OK pour cible mono-langue).

## Avant de committer

1. `npm test` doit passer (248/248)
2. `npm run lint` propre ou tu sais pourquoi
3. `npm run build` sans erreur
4. Commit avec message explicite (voir `git log`). Pas d'emoji, pas de texte promo. Français ou anglais cohérent avec le contexte.
