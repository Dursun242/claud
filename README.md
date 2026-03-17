# ID Maîtrise — Dashboard de Gestion de Chantiers

**SARL ID MAITRISE** — Maîtrise d'œuvre BTP, Le Havre  
9 Rue Henry Genestal, 76600 Le Havre

## Fonctionnalités

- **Tableau de bord** — KPI, agenda du jour, tâches urgentes
- **Google Calendar** — Synchronisé via API (Suivi Pro ID MAITRISE)
- **Qonto** — Factures, devis et clients via API Qonto v2
- **Chantiers** — CRUD complet avec phases BTP (Hors d'air → Technique → Finitions)
- **Planning** — Vue Gantt par lot avec avancement
- **Budget / OS** — Suivi financier par chantier et par lot
- **Tâches** — Liste avec priorités, cycle de statut
- **Annuaire** — Artisans, clients, fournisseurs
- **Comptes Rendus** — CR de chantier avec décisions
- **Assistant IA** — Chat Claude avec reconnaissance vocale
- **Micro flottant néon** — Dictée vocale depuis n'importe quelle page
- **100% responsive mobile** — Utilisable sur tablette au chantier

## Déploiement sur Vercel

### 1. Créer le repo GitHub

```bash
cd id-maitrise-app
git init
git add .
git commit -m "Initial commit - ID Maitrise Dashboard"
git branch -M main
git remote add origin https://github.com/VOTRE_USERNAME/id-maitrise-app.git
git push -u origin main
```

### 2. Déployer sur Vercel

1. Allez sur [vercel.com](https://vercel.com) → **Sign up with GitHub**
2. Cliquez **"Add New..." → "Project"**
3. Sélectionnez le repo `id-maitrise-app`
4. Framework: **Next.js** (détecté automatiquement)
5. Cliquez **"Deploy"**

Votre dashboard sera accessible à : `https://id-maitrise-app.vercel.app`

### 3. Domaine personnalisé (optionnel)

Dans Vercel → Settings → Domains, ajoutez `app.id-maitrise.com`

## Stack technique

- **Next.js 14** — Framework React
- **React 18** — Interface utilisateur
- **localStorage** — Persistance des données côté client
- **Web Speech API** — Reconnaissance vocale
- **Claude API** — Assistant IA (Anthropic)
- **Qonto API v2** — Facturation
- **Google Calendar API** — Agenda

## Développé par Claude pour ID Maîtrise
