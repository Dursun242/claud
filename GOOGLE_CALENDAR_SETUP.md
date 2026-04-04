# 🔧 Configuration Google Agenda - Guide Complet

## ✅ Status Actuel
- ✅ Credentials Google OAuth ajoutés dans `.env.local`
- ✅ Route callback reactivée 
- ✅ Scope amélioré (calendar + calendar.readonly)
- ⏳ **À vérifier:** Configuration Supabase OAuth

---

## 🎯 Prérequis (À Faire)

### 1️⃣ Vérifier Supabase OAuth (CRITIQUE)

**Allez à:** `https://app.supabase.com` → Votre projet → **Authentication** → **Providers**

**Activez Google et entrez:**
```
Client ID:      177954108650-l0qj4hf3j6vogtg35cjsiifmju6km5d0.apps.googleusercontent.com
Client Secret:  GOCSPX-gDhppACE1BCPUAosAzp_i1x839O
Redirect URL:   https://pvnueomejrdhlqqjwzla.supabase.co/auth/v1/callback
```

**Important:** Cochez **ENABLED** ✅

### 2️⃣ Vérifier Google Cloud Console

**Dans Google Cloud Console:**
- ✅ Projet créé
- ✅ Google Calendar API activée
- ✅ OAuth 2.0 Client créé (type: Web application)
- ✅ URIs autorisés = `https://pvnueomejrdhlqqjwzla.supabase.co/auth/v1/callback`

---

## 🚀 Tester la Connexion

### En Local (http://localhost:3000)

```bash
# 1. Démarrer l'app
npm run dev

# 2. Aller à http://localhost:3000
# 3. Cliquer sur "Connecter Google Agenda"
# 4. Autoriser les permissions
```

**Attendus:**
- ✅ Redirige vers Google
- ✅ Demande autorisation "Google Agenda"
- ✅ Redirige vers l'app
- ✅ Token sauvegardé dans `settings` table
- ✅ Événements chargés

### En Production (Vercel)

Ajouter à Vercel:
```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=177954108650-l0qj4hf3j6vogtg35cjsiifmju6km5d0.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-gDhppACE1BCPUAosAzp_i1x839O
NEXT_PUBLIC_APP_URL=https://votre-domaine.vercel.app
```

---

## ❓ Dépannage

### Erreur: "OAuth error: access_denied"
**Solution:** Assurez-vous que:
- ✅ Google OAuth est **ENABLED** dans Supabase
- ✅ Les credentials sont correctes
- ✅ Le redirect URI est exact

### Erreur: "Token missing ou expiré"
**Solution:** Vérifiez que:
- ✅ La table `settings` existe
- ✅ Le token est sauvegardé (SELECT * FROM settings WHERE key='gcal-token')
- ✅ Le token n'est pas expiré (> 1 heure)

### Erreur: "Failed to fetch events"
**Solution:**
- ✅ Vérifiez le scope (doit inclure `calendar`)
- ✅ Vérifiez les calendriers ID dans GoogleCalendarV.js (ligne 6-11)
- ✅ Testez avec l'API Google Playground

### Les événements ne se chargent pas
**Vérifiez:**
1. Token visible dans Console → Application → Storage → `settings`?
2. Erreur dans Console (F12)?
3. Requête `/api/gcal` réussie? (Network tab)

---

## 📝 Variables d'Environnement

**.env.local:**
```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=177954108650-l0qj4hf3j6vogtg35cjsiifmju6km5d0.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-gDhppACE1BCPUAosAzp_i1x839O
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 🔐 Sécurité

**Important:**
- ❌ Ne pas committer les secrets dans le code
- ❌ Ne pas exposer les tokens en localStorage non-chiffré
- ✅ Tokens sauvegardés en DB Supabase (accès RLS)
- ✅ Refresh tokens gérés automatiquement

---

## 📚 Ressources

- [Supabase OAuth with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Google Calendar API](https://developers.google.com/calendar/api)
- [Google OAuth Scopes](https://developers.google.com/identity/protocols/oauth2/scopes#calendar)

---

## ✅ Checklist d'Implémentation

- [ ] Credentials ajoutés dans `.env.local` ✅
- [ ] Route callback reactivée ✅
- [ ] Scope amélioré ✅
- [ ] Google OAuth **ENABLED** dans Supabase ⏳
- [ ] Tester en local
- [ ] Tester en production
- [ ] Vérifier tokens sauvegardés
- [ ] Vérifier événements chargés
- [ ] Tester refresh token expiré

---

**Créé:** 2026-04-04  
**Status:** 🟡 En attente configuration Supabase
