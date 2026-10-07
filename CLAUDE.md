# CLAUDE.md — Guide agent & onboarding technique

Document destiné à un agent IA (Claude Code / Cursor / etc.) ou à un dev qui arrive sur ce codebase. Lis ce fichier en premier.

## Contexte produit

Application de gestion de chantiers BTP pour **ID Maîtrise** (SARL, Le Havre). Deux rôles principaux :
- **Admin / Salarié** (maîtrise d'œuvre) — accès complet : chantiers, OS, CR, PV, contacts, CRM (pipeline commercial), Qonto, Assistant IA, admin users.
- **Client / MOA** (maître d'ouvrage) — accès restreint à SES chantiers uniquement.

## Stack

- **Next.js 15** (App Router) + **React 18**
- **Supabase** : Postgres + Auth OAuth Google + Storage + RLS strictes par rôle
- **IA** (`lib/ai.js`) : Claude Haiku 4.5 ou Mistral Small selon `AI_PROVIDER` (texte) et `AI_PROVIDER_VISION` (images, Claude par défaut), secours automatique sur l'autre fournisseur ; une demande peut choisir son fournisseur et son modèle (`prefer`, `mistralModel`, `anthropicModel` : chiffrage estimatif sur Mistral Large) — assistant IA, chiffrage de devis, extraction vision (devis photo, contacts photo), analyse Qonto. Appels HTTP directs, pas de SDK.
- **Odoo JSON-RPC** : signatures électroniques via module Sign
- **Qonto API** : import factures/devis (proxy read-only)
- **Annuaire des entreprises** (`recherche-entreprises.api.gouv.fr`, État, gratuit, sans clé) : recherche par SIRET / nom / dirigeant pour les contacts (`api/entreprises`, `lib/entreprises.js`)
- **Jest + @testing-library/react** : ~800 tests, ~20 s d'exécution

## Topologie

```
src/app/
├─ page.js                    → entrée app (AuthProvider + dashboard)
├─ layout.js                  → root layout + next/font DM Sans
├─ RootWrapper.js             → providers (Toast, Confirm, WebVitals)
├─ (src/middleware.js)       → headers sécurité (pas de CSP, voir "dette")
├─ auth.js                    → login + AuthProvider Supabase
├─ signer/[token]/page.js     → page publique de signature d'un devis (sans compte, jeton)
├─ reponse/[token]/page.js    → page publique de réponse à la relance d'un devis (raison choisie dans le mail : budget, autre proposition, projet reporté…, autre ; sans compte, jeton)
├─ deposer/[token]/page.js    → page publique de dépôt des documents d'une entreprise (Kbis, décennale, fiscale, URSSAF, RIB ; sans compte, jeton)
│
├─ dashboards/
│   ├─ shared.js              ⚠ 880+ lignes. SB (CRUD), constants, icons, styles, widgets. À splitter un jour.
│   ├─ AdminDashboard.js      → shell admin + lazy-load pages
│   └─ ClientDashboard.js     → shell client + lazy-load pages
│
├─ pages/                     → 1 page = 1 onglet. DashboardV, ProjectsV, OrdresServiceV, ContactsV, CrmV, AIV, ...
├─ components/                → briques UI réutilisables (Modal, Badge, Skeleton, OsCard, ChantierCard, PVRow...)
│                               components/crm/ : écrans du CRM (pipeline, fiche affaire, formulaires, devis) — CrmV.js ne fait qu'orchestrer
│                               components/chiffrage/ : chiffrage estimatif (DPGF) dans la fiche chantier (ChiffrageSection : travaux HT, total TTC MOE comprise, ratio TTC/m² sur SHAB + ½ garage, estimé / engagé par lot avec les OS, relecture des prix par l'IA, exports PDF et Excel ; ChiffrageCreateModal : plans PCMI → métré → chiffrage / description / import (JSON repris sans IA) / à la main ; ChiffrageEditor : lots numérotés, lot honoraires MOE, prix verrouillés, calage sur un objectif TTC, prix payés dans les OS)
│                               components/cr/ : éditeur plein écran des comptes rendus (CREditor : mode Réunion pas à pas / mode Rédaction ; sections par lot, points, photos, dictée + IA, présences/convocation) + envoi par mail (CRSendModal), partagé par ReportsV et ProjectsV
├─ contexts/                  → ToastContext + ConfirmContext (non-invasive, context split pour éviter re-renders)
├─ hooks/                     → useFloatingMic, useAttachments, useComments, useUndoableDelete, useSignaturesSync, useCrmData, useCrmDevis (logique devis du CRM), useCrEditor (état + brouillon local d'un CR), useDictation (dictée vers un champ), useNavReturn (fiche ouverte depuis une autre page : la fermer y ramène)…
├─ lib/                       → auth, fetchWithRetry, odoo, validators, notifications, activityLog, chantierFinances
│                               mailer.js (SMTP serveur) · notifications.js (serveur, service role) · crm.js (logique pure pipeline) + devis.js / devisAi.js / qontoDevis.js (calculs, prix habituels, vérifs devis, format Qonto) + crmDb.js (accès Supabase CRM, hors shared.js) + crmApi.js (appels /api/* du CRM avec JWT, PDF base64)
│                               conformite.js (documents des entreprises : règles de validité, état par entreprise, entreprises actives, priorités, relances, texte du mail) · conformiteAi.js (lecture IA des documents) · conformiteServer.js (dépôt signé, lecture, enregistrement, demandes) · conformiteClient.js (dépôt depuis le navigateur) · legalCheck.js / legalCheckServer.js (contrôle légal : annuaire des entreprises + BODACC, entreprise fermée / procédure collective) · dossierVigilance.js (dossier de vigilance PDF, pdf-lib, documents en annexe)
│                               chiffrage.js (DPGF : totaux travaux / honoraires / TTC, ratio TTC/m² MOE comprise, calage sur un objectif TTC hors prix verrouillés, comparaison estimé / OS par lot via ordres_service.lot, contrôles de bon sens, lot suggéré d'après la spécialité, prix de référence des OS, import JSON) · chiffrageBareme.js (barème de prix et habitudes ID Maîtrise donnés à l'IA) · chiffrageXlsx.js (export .xlsx à la charte ID Maîtrise, exceljs chargé à la demande, montants en formules) · hooks/useChiffrage.js (table chantier_chiffrages, migration 040)
│                               crSuivi.js (CR : numéro par chantier, points numérotés repris d'un CR à l'autre, relances + montée de priorité, sections par lot / avancement prévu, application de la proposition IA, textes des mails) · crEditor.js (état de l'éditeur, brouillon, aperçu) · crDb.js (enregistrement CR + tâches + rdv, statut Brouillon / Diffusé) · crPhotos.js (photos : réduction, dépôt, lecture pour le PDF) · crAi.js (schéma + nettoyage de la réponse IA)
│
└─ api/                       → 35 routes. Pattern unique : verifyAuth() / verifyStaff() + createLogger() + mock-friendly.
    ├─ admin/*                → service role uniquement (users, demo-mode, reset-demo-data)
    ├─ claude/                → assistant IA (Claude ou Mistral via lib/ai.js, réponse au format Anthropic, rate limit 20/min/IP)
    ├─ devis-ia, devis/send   → CRM : IA de chiffrage + envoi SMTP du devis (staff only, verifyStaff)
    ├─ devis/qonto            → CRM : devis créé dans Qonto (numéro + PDF Qonto), import des devis Qonto, suivi des statuts (staff only)
    ├─ devis/documents        → CRM : pièces jointes des mails de devis (documents permanents Kbis/décennale + fichiers ponctuels, dépôt direct dans Storage par URL signée, 10 Mo, staff only)
    ├─ devis/sign             → CRM : demande de signature électronique d'un devis (staff only)
    ├─ chiffrage/ia           → chiffrage estimatif (staff only) : plans du permis (PCMI, PDF / photos déposés par URL signée dans `chiffrage-plans/<chantier>/`, effacés une fois lus) → métré à vérifier ; DPGF généré en deux temps depuis le métré ou une description — « trame » (lots, métré clé, hypothèses) puis « lot » (postes d'un lot, lancés en parallèle par lib/chiffrageGen.js : chaque appel tient sous 60 s) — avec les prix des OS, les prix verrouillés des autres DPGF et le barème ID Maîtrise ; moteur CHIFFRAGE_AI_PROVIDER / CHIFFRAGE_MISTRAL_MODEL (défaut Mistral Large, Claude en secours) ; import (JSON sans IA, texte / tableau sans invention de prix) ; relecture des prix. ANTHROPIC_PLANS_MODEL : modèle Claude dédié à la lecture des plans (facultatif)
    ├─ cr/send                → envoi du CR par mail (PDF + convocation + actions de chaque entreprise, un mail par destinataire, staff only)
    ├─ cr/ia                  → dictée de réunion → proposition structurée (observations / avancement par lot, états des points, nouveaux points, décisions), staff only
    ├─ devis/relance          → CRM : relance d'un devis sans réponse, avec choix de réponse pour le client (lib/devisRelance.js, boutons vers /reponse/<jeton>), relance suivante à J+7 (staff only)
    ├─ devis/reponse          → page publique /reponse/<jeton> : réponse du client à la relance (événement « reponse », prochaine action dans le CRM selon la raison, équipe prévenue) ; jeton = crm_devis.track_token
    ├─ devis/track            → image de suivi (1×1) des mails de devis : enregistre les ouvertures (public, jeton)
    ├─ devis/public           → page publique /signer/<jeton> : consultation + signature du devis (sans compte, jeton) ; signé → chantier + tâche « Lancer les travaux » (lib/devisWon.js)
    ├─ cron/qonto-status      → vérification horaire des devis acceptés / annulés dans Qonto (GitHub Actions, secret CRON_SECRET) ; accepté → chantier + tâche (lib/devisWon.js)
    ├─ conformite             → documents des entreprises (staff only) : dépôt par URL signée, lecture IA des dates (PDF → Claude uniquement), correction, demande par mail avec lien de dépôt, contrôle légal immédiat, dossier de vigilance PDF
    ├─ conformite/public      → page /deposer/<jeton> : état des documents + dépôt par l'entreprise (sans compte, jeton 30 jours), l'équipe est prévenue
    ├─ cron/conformite        → relance automatique hebdomadaire (GitHub Actions, CRON_SECRET) des entreprises suivies (chantier en cours ou demande envoyée) dont un document manque, est erroné ou expire + contrôle légal quotidien (annuaire + BODACC)
    ├─ cron/daily-digest      → mail du matin : priorités du jour (lib/dailyPriorities.js, même liste que le tableau de bord) + mot du jour IA, à l'équipe à 7 h (Paris) du lundi au vendredi, un envoi par jour (settings.daily_digest_last_sent) ; GitHub Actions, secret CRON_SECRET, ?force=1 pour un envoi manuel
    ├─ odoo/*                 → signatures
    ├─ pv-reception/*         → flux PV métier
    ├─ extract-*/             → Claude Vision (devis + contacts)
    ├─ entreprises, qonto     → proxies tiers (annuaire des entreprises de l'État ; qonto : lecture seule)
    ├─ qonto/token            → connexion Qonto (état staff, enregistrement/suppression admin) — le jeton n'est jamais renvoyé au navigateur
    └─ metrics/               → ingest Web Vitals (sendBeacon)
```

## Chargement initial (cold start)

Stage 1 = **critique** (chantiers, tasks, OS, CR) → 4 requêtes Supabase → dashboard rendu.
Stage 2 = **secondaires** (contacts, planning, rdv, counts PJ via RPC `chantier_attachment_counts`) → hydrate en arrière-plan.

Cf. `SB.loadCritical()` / `SB.loadSecondary()` dans `dashboards/shared.js`.

Stage 3 = **CRM** (`crm_opportunites`, `crm_interactions`, `crm_devis`, `crm_devis_events`, migrations 025→030, 041) via `useCrmData({ enabled })` dans `AdminDashboard` : lancé seulement après le stage 1, partagé (React Query) par CrmV, DashboardV (widget relances), ContactsV (badge affaires), QontoV (→ CRM), AIV (actions IA) et la recherche globale.

## Hors ligne (usage sur chantier)

- `public/sw.js` (production) : l'application s'ouvre sans réseau (page `/` + fichiers `/_next/static`). N'intercepte ni `/api` ni Supabase.
- `lib/offlineCache.js` + `lib/offlineStore.js` : les données consultées (requêtes `dashboard` et `crm`) sont gardées dans IndexedDB par utilisateur et restaurées au démarrage ; effacées à la déconnexion.
- File d'attente (`enqueue` / `flushOutbox`) : modifications faites sans réseau, envoyées au retour de la connexion (`hooks/useOfflineSync.js`, handlers dans `roleBasedDashboard.js`). Aujourd'hui : statut des tâches (`hooks/useSaveTask.js`).
- Comptes rendus : le brouillon en cours (photos comprises) est gardé dans IndexedDB (`cr-draft:*`) pendant la saisie et proposé à la réouverture ; l'enregistrement se fait au retour du réseau.
- `auth.js` : sans réponse du serveur, le dernier profil vérifié sur l'appareil est réutilisé (pas de déconnexion hors ligne).

## Conventions & règles du projet

1. **Server-only pour les secrets** : `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ODOO_API_KEY`, `qonto-token` n'apparaissent **jamais** dans le bundle client. Les appels tiers passent par les routes `/api/*`. Seule exception : la Base Adresse Nationale (`api-adresse.data.gouv.fr`, publique, sans clé) appelée directement par `components/AddressPicker.js`.
2. **Auth** : toute route `/api/*` non-admin (sauf `/api/metrics`, `/api/auth/google/callback`, `/api/devis/public`, `/api/devis/track`, `/api/devis/reponse` et `/api/conformite/public` — accès par jeton, `/api/cron/*` — secret `CRON_SECRET`) fait `verifyAuth(request)` en premier. Retour 401 si absent. Les routes qu'un client MOA n'utilise pas (Qonto, CRM/devis, création de signatures ou de PV…) utilisent `verifyStaff(request)` (401/403). Une route ouverte aux clients qui écrit en service role relit d'abord la ressource avec `userClientFromToken` (RLS) pour vérifier que le chantier est bien le sien (cf. `pv-reception/decision`, `upload`).
3. **Logging** : toutes les routes utilisent `createLogger('source')` (`lib/logger.js`), jamais `console.error` directement.
4. **Toasts, jamais `alert()`** : `useToast()` dans les composants. `useFloatingMic` prend `onError` pour les erreurs hors-UI.
4 bis. **Fenêtres de saisie** : passer par `components/Modal` (ne se ferme que par ✕ ou les boutons ; ✕ après saisie demande confirmation). Toute autre fenêtre ou écran plein page de saisie appelle `useLeaveGuard(open)` (`hooks/useLeaveGuard.js`) : retour du téléphone bloqué, fermeture / rechargement de la page confirmés. Pas de fermeture au clic sur le fond.
5. **Tests routes API** : env `node` via pragma `/** @jest-environment node */`. Mock deps via `jest.mock()`. Voir `api/qonto/__tests__/route.test.js` comme modèle canonique (gère `jest.resetModules()` pour caches module-level).
6. **Tests UI** : env `jsdom` par défaut. RTL + `userEvent`. Voir `components/os/__tests__/OsCard.test.js` comme modèle.
7. **Pas de `'use client'` sur les fichiers utilitaires purs** — réservé aux fichiers avec hooks/state.
8. **Éviter `<img>`** : utiliser `next/image` sauf pour data-URIs ou signed URLs à TTL court (cf. `components/AttachmentsSection.js` pour exemple avec `eslint-disable`).
9. **Ne JAMAIS pousser sur `main` sans autorisation explicite**. Branches feature : `claude/…` ou `feat/…`. Merger via PR ou fast-forward local sur demande.

## Outils Claude Code

`.claude/settings.json` active le plugin **ECC** (Everything Claude Code, `ecc@ecc`, marketplace `affaan-m/ECC`) pour toutes les sessions sur ce dépôt : agents, skills, commandes (`/ecc:…`) et hooks. Les « rules » d'ECC ne sont pas installées : en cas de conflit, ce fichier CLAUDE.md fait foi (messages de commit, branches, conventions ci-dessus).

## Commandes

```bash
npm install          # deps
npm run dev          # dev sur :3000
npm run build        # build prod
npm test             # Jest (~800 tests, ~20 s)
npm test -- --ci src/app/api/qonto  # tests filtrés
npm run lint         # next lint
```

## Variables d'environnement

Voir `.env.example` à la racine. Minimum requis pour dev :
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (côté serveur)
- `ANTHROPIC_API_KEY` (pour AIV + extraction)

## Migrations DB

**Ordre critique** : voir `migrations/APPLY_ORDER.md`. Les migrations numérotées 001→042 s'appliquent dans l'ordre via le SQL Editor Supabase. Chaque migration ayant un impact non-trivial a un `<num>_README.md` dédié.

## Dette technique assumée

- **`shared.js` = 880+ lignes** → plan de split documenté dans `/docs/` (à créer).
- **Pas de CSP** → refacto styles inline → classes ou ajout nonces (~1 j).
- **Tests pages `*V.js`** quasi absents (seulement `CrmV`, composants, hooks, routes API).
- **Pas d'i18n** → tout en français dur (OK pour cible mono-langue).

## Avant de committer

1. `npm test` doit passer (100 %)
2. `npm run lint` propre ou tu sais pourquoi
3. `npm run build` sans erreur
4. Commit avec message explicite (voir `git log`). Pas d'emoji, pas de texte promo. Français ou anglais cohérent avec le contexte.
