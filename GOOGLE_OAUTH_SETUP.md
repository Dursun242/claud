# 🔐 Guide Complet : Configurer Google OAuth avec Supabase & Vercel

## 1️⃣ Prérequis

- ✅ Projet Supabase créé
- ✅ Application Vercel liée au repository GitHub
- ✅ Projet Google Cloud Console (nouveau ou existant)

---

## 2️⃣ Configuration Google Cloud Console

### Étape 1 : Créer/Sélectionner le Projet

1. Allez à [Google Cloud Console](https://console.cloud.google.com)
2. Créez un nouveau projet ou sélectionnez votre projet existant
3. Recherchez "Google+ API" ou "People API"
4. Activez **Google+ API** (ou **People API** pour les infos utilisateur)

### Étape 2 : Créer les Identifiants OAuth

1. **Allez à** : Credentials (Identifiants) → **Create Credentials** → **OAuth 2.0 Client IDs**
2. Si vous n'avez pas de "OAuth consent screen", configurez-le d'abord :
   - **User Type** : External
   - **App name** : ID Maîtrise
   - **User support email** : votre email
   - **Scopes** : Sélectionnez :
     - `email`
     - `profile`
     - `openid`

3. **Créez un Client ID** :
   - **Type** : Web Application
   - **Name** : ID Maîtrise - Web App

### Étape 3 : Ajouter les Origines Autorisées et URLs de Redirection

**IMPORTANT** : Ajoutez TOUTES ces URLs :

#### En DEV (localhost) :
```
Authorized JavaScript origins:
  - http://localhost:3000
  - http://localhost:3001

Authorized redirect URIs:
  - http://localhost:3000/auth/callback
  - http://localhost:3001/auth/callback
```

#### En PROD (Vercel) :
```
Authorized JavaScript origins:
  - https://[YOUR_VERCEL_DOMAIN].vercel.app
  - https://pvnueomejrdhlqqjwzla.supabase.co

Authorized redirect URIs:
  - https://[YOUR_VERCEL_DOMAIN].vercel.app/auth/callback
  - https://pvnueomejrdhlqqjwzla.supabase.co/auth/callback
```

**Remplacez** `[YOUR_VERCEL_DOMAIN]` par votre domaine réel (ex: `claude-dusky` si l'URL est `claude-dusky.vercel.app`).

### Étape 4 : Copier les Credentials

Une fois créé, copiez :
- **Client ID** (exemple: `123456789-abcd1234.apps.googleusercontent.com`)
- **Client Secret** (gardez secret !)

---

## 3️⃣ Configuration Supabase

### Étape 1 : Allez à Authentication → Providers

1. [Supabase Dashboard](https://app.supabase.com)
2. Sélectionnez votre projet
3. **Authentication** → **Providers**
4. Trouvez **Google** et cliquez pour l'éditer

### Étape 2 : Activez Google et collez les credentials

```
✓ Enabled: ON
Client ID:     [Collez votre Google Client ID]
Client Secret: [Collez votre Google Client Secret]
```

### Étape 3 : Copiez les URLs de Redirection Supabase

Supabase affiche deux URLs de redirection :
```
https://pvnueomejrdhlqqjwzla.supabase.co/auth/v1/callback?provider=google
```

**Ajoutez cette URL** dans Google Cloud Console → Authorized redirect URIs.

### Étape 4 : Vérifiez la configuration OAuth Flow

1. **Authentication** → **URL Configuration**
2. Vérifiez l'URL du site :
   ```
   Site URL: https://[YOUR_VERCEL_DOMAIN].vercel.app
   ```
3. **Redirect URLs** :
   ```
   https://[YOUR_VERCEL_DOMAIN].vercel.app/auth/callback
   ```

---

## 4️⃣ Configuration Vercel

### Ajouter les Variables d'Environnement

Dans Vercel Dashboard → Project Settings → Environment Variables :

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://pvnueomejrdhlqqjwzla.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Application URL (pour le callback OAuth)
NEXT_PUBLIC_APP_URL=https://[YOUR_VERCEL_DOMAIN].vercel.app

# Service Role (optionnel, pour les API routes côté serveur)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 5️⃣ Configuration Locale (.env.local)

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://pvnueomejrdhlqqjwzla.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Pour développement local
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Optionnel pour les tests locaux
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 6️⃣ Vérification des Fichiers de Code

✅ Les fichiers suivants ont été mis à jour :

### `src/app/supabaseClient.js`
```javascript
// Flow PKCE (correct)
{
  auth: {
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  }
}
```

### `src/middleware.js` (NOUVEAU)
- Gère la session Supabase côté serveur
- Rafraîchit les tokens automatiquement
- Synchronise les cookies

### `src/app/auth/callback/page.js` (NOUVEAU)
- Page de callback OAuth
- Traite le code d'autorisation
- Établit la session utilisateur

### `src/app/api/auth/google/callback/route.js` (MODIFIÉ)
- Redirige vers la page callback
- Gère les erreurs OAuth

### `src/app/auth.js`
- Fonction `handleGoogleLogin()` mises à jour
- URL de callback correcte : `/auth/callback`

---

## 7️⃣ Tester en LOCAL

```bash
# 1. Installer les dépendances
npm install

# 2. Démarrer le serveur dev
npm run dev

# 3. Allez à http://localhost:3000
# 4. Cliquez sur "Se connecter avec Google"
# 5. Autorisez l'accès
# 6. Vous devriez être redirigé vers /auth/callback
# 7. La session devrait s'établir et vous revenir à l'accueil
```

### Debugging en LOCAL

Ouvrez la console du navigateur (F12) et cherchez :

```javascript
// ✅ Si tout fonctionne :
✓ Session établie avec succès: user@gmail.com

// ❌ Si erreur :
❌ Erreur lors du callback OAuth: ...
```

---

## 8️⃣ Déployer sur Vercel

```bash
# 1. Commit et push vos changements
git add .
git commit -m "Fix: Google OAuth with PKCE flow"
git push origin claude/fix-google-oauth-KzoA4

# 2. Vercel redéploie automatiquement
# 3. Vérifiez dans Vercel → Deployments → Inspect

# 4. Si erreur "invalid redirect_uri", vérifiez :
#    - Google Cloud Console: URLs de redirection ajoutées ?
#    - Supabase: URL Site correcte ?
#    - Vercel: NEXT_PUBLIC_APP_URL défini ?
```

---

## 9️⃣ Troubleshooting

### ❌ Erreur: "invalid_request" ou "redirect_uri_mismatch"

**Cause** : L'URL de callback ne correspond pas entre Google et votre app.

**Solution** :
```
1. Allez à Google Cloud Console → Credentials
2. Cherchez "Authorized redirect URIs"
3. Assurez-vous que https://[VOTRE_DOMAINE]/auth/callback y est
4. Attendez 5 minutes que les changements se propagent
5. Essayez de nouveau
```

### ❌ Erreur: "unsupported_response_type"

**Cause** : Flow implicit au lieu de PKCE.

**Solution** : ✅ Déjà corrigé dans `supabaseClient.js`

### ❌ Boucle infinie de redirection

**Cause** : Middleware mal configuré ou `detectSessionInUrl` à false.

**Solution** :
```javascript
// supabaseClient.js
auth: {
  flowType: 'pkce',
  detectSessionInUrl: true, // IMPORTANT
}
```

### ❌ Erreur: "Access Denied" après login

**Cause** : Votre email n'est pas dans la table `authorized_users`.

**Solution** :
1. Allez à Supabase → SQL Editor
2. Exécutez :
```sql
INSERT INTO authorized_users (email, actif) 
VALUES ('votre.email@gmail.com', true);
```

### ❌ Page blanche après callback

**Cause** : Supabase session non détectée côté client.

**Solution** :
```javascript
// Vérifiez en console (F12)
await supabase.auth.getSession()
// Doit afficher un objet session avec user.email
```

---

## 🔟 Checklist Finale

- [ ] Google Cloud Console : Client ID & Secret copiés ✓
- [ ] Google Cloud Console : Authorized redirect URIs complétés ✓
- [ ] Supabase : Google provider activé ✓
- [ ] Supabase : Client ID & Secret collés ✓
- [ ] Supabase : Site URL correct dans URL Configuration ✓
- [ ] Vercel : NEXT_PUBLIC_APP_URL défini ✓
- [ ] Local : npm install ✓
- [ ] Local : npm run dev → Login fonctionne ✓
- [ ] Local : Session établie dans console ✓
- [ ] Production : Déploiement réussi ✓
- [ ] Production : Login fonctionne ✓

---

## 📚 Ressources

- [Supabase Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Next.js + Supabase Guide](https://supabase.com/docs/guides/auth/auth-helpers/nextjs)
- [PKCE Flow](https://datatracker.ietf.org/doc/html/rfc7636)
