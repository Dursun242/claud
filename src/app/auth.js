'use client'
import { useState, useEffect, createContext, useContext, useRef } from 'react'
import Image from 'next/image'
import { supabase } from './supabaseClient'
import { writeActivityLog } from './lib/activityLog'
import { clearOfflineData } from './lib/offlineStore'
import { Icon, I } from './components/icons'

const SESSION_LABELS = {
  login:            'Connexion',
  logout:           'Déconnexion',
  access_denied:    'Tentative non autorisée',
  session_expired:  'Session expirée',
};

// Wrapper autour du helper centralisé. `blocking=true` force un await
// sur l'insert : utile pour access_denied / logout où on risque de
// perdre le log si signOut() invalide la session avant la fin de
// l'insert réseau.
function logSession(action, metadata = null, entityLabel = null, blocking = false) {
  return writeActivityLog(supabase, {
    action,
    entity_type: 'session',
    entity_label: entityLabel || SESSION_LABELS[action] || action,
    metadata: metadata || null,
  }, blocking);
}

// ─── AUTH CONTEXT ───
const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

// ─── AUTH PROVIDER ───
//
// Gère :
// - Login/logout via Supabase
// - Vérification d'autorisation (profil actif en DB)
// - Détection d'expiration de session : quand `session` devient null
//   APRÈS avoir été valide, on considère que la session a expiré et on
//   affiche un message dédié sur l'écran de login.
// - Refresh proactif de la session quand l'utilisateur revient sur
//   l'onglet après une longue absence (visibilitychange).
// Dernier profil vérifié par le serveur, par email : permet d'ouvrir
// l'application hors ligne (sur chantier). Effacé à la déconnexion.
const PROFILE_KEY = (email) => `idm_profile:${email}`
function saveCachedProfile(email, profile) {
  try {
    if (profile) localStorage.setItem(PROFILE_KEY(email), JSON.stringify(profile))
    else localStorage.removeItem(PROFILE_KEY(email))
  } catch {}
}
function readCachedProfile(email) {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY(email)) || 'null') } catch { return null }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  // Session expirée = était loggé, ne l'est plus, et ce n'est pas un logout volontaire
  const [expired, setExpired] = useState(false)
  const wasSignedInRef = useRef(false)

  useEffect(() => {
    let isMounted = true

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return

      if (session?.user) {
        wasSignedInRef.current = true
        // Vérification via API serveur (service role key, bypass RLS garanti)
        const email = session.user.email?.trim().toLowerCase()
        let profile = null
        // Réponse claire du serveur (profil trouvé ou non). Sans réseau (sur
        // chantier, en sous-sol…) ou si le serveur ne répond pas, on reprend
        // le dernier profil vérifié sur cet appareil au lieu de déconnecter.
        let verified = false
        try {
          const res = await fetch('/api/admin/users', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          })
          if (res.ok) {
            const json = await res.json()
            profile = (json.data || []).find(
              u => u.email?.trim().toLowerCase() === email && u.actif
            )
            verified = true
          } else if (res.status === 401 || res.status === 403) {
            verified = true
          }
        } catch (_) {}
        if (verified) saveCachedProfile(email, profile)
        else profile = readCachedProfile(email)

        if (isMounted) {
          if (profile) {
            setUser(session.user)
            setProfile(profile)
            setDenied(false)
            setExpired(false)
            // Log uniquement les vraies connexions (pas les restaurations de session
            // ni les refresh de token) pour éviter de polluer le journal.
            if (event === 'SIGNED_IN') {
              logSession('login', { provider: session.user.app_metadata?.provider || null })
            }
          } else if (!verified) {
            // Pas de réponse du serveur et aucun profil connu sur cet
            // appareil : on n'ouvre pas l'app, mais on ne déconnecte pas
            // (la session reste valable au retour du réseau).
            setUser(null)
            setProfile(null)
          } else {
            // Log AVANT signOut et AWAIT pour garantir l'insert avant
            // que la session ne soit invalidée côté réseau (critique :
            // c'est précisément ce genre d'événement qu'on veut tracer).
            await logSession('access_denied', {
              email: email || null,
              provider: session.user.app_metadata?.provider || null,
            }, email ? `Tentative refusée — ${email}` : 'Tentative refusée', true)
            setDenied(true)
            setUser(null)
            setProfile(null)
            await supabase.auth.signOut()
          }
        }
      } else {
        // Pas de session : soit on démarre fresh, soit on vient d'être déconnecté.
        if (isMounted) {
          // On détecte une expiration (≠ logout volontaire) si :
          //   1. on était loggé (wasSignedInRef)
          //   2. ET ce n'est pas un logout volontaire (flag sessionStorage posé par logout())
          //   3. ET ce n'est pas un accès refusé (déjà géré)
          let voluntary = false
          try { voluntary = sessionStorage.getItem('idm_voluntary_logout') === '1' } catch {}
          if (wasSignedInRef.current && !voluntary && !denied) {
            setExpired(true)
          }
          // Nettoie le flag dans tous les cas
          try { sessionStorage.removeItem('idm_voluntary_logout') } catch {}
          wasSignedInRef.current = false
          setUser(null)
          setProfile(null)
        }
      }

      if (isMounted) setLoading(false)
    })

    // Refresh proactif quand l'onglet redevient visible après une longue absence.
    // Supabase refresh automatiquement en background, mais si l'ordi a dormi
    // longtemps, le refresh peut avoir échoué silencieusement.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession().then(({ data: { session } }) => {
          // Si pas de session alors qu'on pensait être loggé → refresh
          if (!session && wasSignedInRef.current) {
            supabase.auth.refreshSession().catch(async () => {
              // Refresh raté : best effort pour tracer avant que la session
              // ne soit totalement invalidée. onAuthStateChange fera le reste.
              await logSession('session_expired', { reason: 'refresh_failed' })
            })
          }
        })
      }
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange)
    }

    return () => {
      isMounted = false
      subscription?.unsubscribe()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AuthContext.Provider value={{ user, profile, loading, denied, expired }}>
      {children}
    </AuthContext.Provider>
  )
}

// Google sign-in SVG paths
const GP_BLUE = "M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92" +
  "a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z";
const GP_GREEN = "M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77" +
  "c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53" +
  "H2.18v2.84C3.99 20.53 7.7 23 12 23z";
const GP_YELLOW = "M5.84 14.09c-.22-.66-.35-1.36-.35-2.09" +
  "s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12" +
  "s.43 3.45 1.18 4.93l2.85-2.22.81-.62z";
const GP_RED = "M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15" +
  "C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07" +
  "l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z";

// ─── LOGIN PAGE ───
export function LoginPage() {
  const [loggingIn, setLoggingIn] = useState(false)
  const [error, setError] = useState(null)
  const { denied, expired } = useAuth()

  const handleGoogleLogin = async () => {
    setLoggingIn(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      }
    })
    if (error) {
      setError(error.message)
      setLoggingIn(false)
    }
  }

  // Connexion : page calme, fond gris de l'app, une carte et une action
  const notice = (tone, icon, title, body) => (
    <div role={tone === 'red' ? 'alert' : 'status'} style={{
      display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left',
      background: `var(--${tone}-tint)`, border: `1px solid var(--${tone}-line)`, borderRadius: 10,
      padding: '12px 16px', marginBottom: 20, fontSize: 13,
      color: tone === 'red' ? 'var(--red-text)' : 'var(--orange-deep)',
    }}>
      <span style={{ display: 'inline-flex', flexShrink: 0, marginTop: 1 }}><Icon d={icon} size={16} stroke={1.75} /></span>
      <div style={{ lineHeight: 1.5 }}>
        {title && <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>}
        {body}
      </div>
    </div>
  )

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--grouped-bg)', fontFamily: 'inherit', padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '40px 32px', maxWidth: 400, width: '100%',
        border: '1px solid var(--separator)', boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
        animation: 'fadeInUp 0.4s cubic-bezier(.22, 1, .36, 1)', boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, background: 'var(--grouped-bg)', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          }}>
            <Image src="/icon-192.png" alt="" width={36} height={36} priority style={{ objectFit: 'contain' }} />
          </div>
          <div style={{ textAlign: 'left' }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--label)' }}>ID Maîtrise</h1>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--label-secondary)' }}>Suivi des chantiers de maîtrise d&apos;œuvre</p>
          </div>
        </div>

        {denied && notice('red', I.alert, 'Accès refusé', <>
          Votre compte Google n&apos;est pas autorisé pour le moment.
          Contactez-nous à{' '}
          <a href="mailto:contact@id-maitrise.com" style={{ color: 'inherit', fontWeight: 600 }}>contact@id-maitrise.com</a>
        </>)}
        {expired && !denied && notice('orange', I.clock, 'Session expirée', <>
          Votre session a expiré par mesure de sécurité. Reconnectez-vous avec votre compte Google pour continuer.
        </>)}
        {error && !denied && notice('red', I.alert, null, error)}

        <button
          onClick={handleGoogleLogin}
          disabled={loggingIn}
          aria-label="Se connecter avec Google"
          className="login-btn"
          style={{
            width: '100%', minHeight: 48, padding: '0 24px', borderRadius: 12,
            border: '1px solid var(--separator-opaque)', background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            cursor: loggingIn ? 'wait' : 'pointer', fontSize: 15, fontWeight: 500,
            color: 'var(--label)', fontFamily: 'inherit',
          }}
        >
          {loggingIn ? (
            <>
              <span aria-hidden="true" style={{
                width: 16, height: 16, border: '2px solid var(--separator)',
                borderTopColor: 'var(--label-secondary)', borderRadius: '50%',
                display: 'inline-block', animation: 'spin .8s linear infinite'
              }}/>
              Connexion en cours…
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path d={GP_BLUE} fill="#4285F4"/>
                <path d={GP_GREEN} fill="#34A853"/>
                <path d={GP_YELLOW} fill="#FBBC05"/>
                <path d={GP_RED} fill="#EA4335"/>
              </svg>
              Se connecter avec Google
            </>
          )}
        </button>

        <p style={{ margin: '16px 0 0', fontSize: 13, color: 'var(--label-secondary)', lineHeight: 1.5 }}>
          Accès réservé aux collaborateurs et aux maîtres d&apos;ouvrage d&apos;ID Maîtrise
        </p>

        <div style={{
          marginTop: 24, padding: '12px 16px', borderRadius: 10,
          background: 'var(--grouped-bg)', fontSize: 13, color: 'var(--label-2)', lineHeight: 1.5,
        }}>
          <div style={{ fontWeight: 600, color: 'var(--label)', marginBottom: 4 }}>Pas encore client ?</div>
          Essayez l&apos;outil gratuitement en mode démo : connectez-vous avec n&apos;importe quel compte Gmail
        </div>

        <p style={{ margin: '32px 0 0', paddingTop: 16, borderTop: '1px solid var(--separator)', fontSize: 12, color: 'var(--label-tertiary)', lineHeight: 1.5 }}>
          SARL ID Maîtrise · SIRET 921 536 181 00024<br />
          9 rue Henry Genestal, 76600 Le Havre
        </p>
      </div>
    </div>
  )
}

// ─── LOGOUT ───
// Flag posé dans sessionStorage pour différencier un logout volontaire
// d'une expiration de session. AuthProvider le lit au SIGNED_OUT suivant.
export async function logout() {
  try { sessionStorage.setItem('idm_voluntary_logout', '1') } catch {}
  // Données hors ligne de cet appareil (profil, cache, file d'attente)
  await clearOfflineData()
  // Logger AVANT signOut en mode BLOCKING : une fois déconnecté, RLS
  // bloque l'insert. Le await garantit que le log arrive en DB avant
  // la fermeture de la session.
  await logSession('logout', null, null, true)
  await supabase.auth.signOut()
}
