'use client'
import { useState, useEffect, createContext, useContext, useRef } from 'react'
import { supabase } from './supabaseClient'

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
        try {
          const res = await fetch('/api/admin/users', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          })
          if (res.ok) {
            const json = await res.json()
            profile = (json.data || []).find(
              u => u.email?.trim().toLowerCase() === email && u.actif
            )
          }
        } catch (_) {}

        if (isMounted) {
          if (profile) {
            setUser(session.user)
            setProfile(profile)
            setDenied(false)
            setExpired(false)
          } else {
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
            supabase.auth.refreshSession().catch(() => {
              // Le refresh a échoué → onAuthStateChange va déclencher l'état "expired"
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

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0F172A 0%, #1E3A5F 50%, #0F172A 100%)',
      fontFamily: "'DM Sans', sans-serif", padding: 20, position: 'relative', overflow: 'hidden',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes fadeIn { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes floatBg1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(30px,-20px) scale(1.1); } }
        @keyframes floatBg2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-30px,20px) scale(1.05); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Halos décoratifs en arrière-plan (très subtils) */}
      <div aria-hidden style={{
        position: 'absolute', top: '-10%', left: '-10%',
        width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(96,165,250,0.15) 0%, transparent 70%)',
        animation: 'floatBg1 12s ease-in-out infinite', pointerEvents: 'none',
      }}/>
      <div aria-hidden style={{
        position: 'absolute', bottom: '-10%', right: '-10%',
        width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)',
        animation: 'floatBg2 15s ease-in-out infinite', pointerEvents: 'none',
      }}/>

      <div style={{
        background: '#fff', borderRadius: 24, padding: '48px 40px', maxWidth: 420, width: '100%',
        boxShadow: '0 25px 80px rgba(0,0,0,0.4)', animation: 'fadeIn 0.5s ease', textAlign: 'center',
        position: 'relative', zIndex: 1,
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: 20, background: '#F8FAFC',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', overflow: 'hidden',
        }}>
          <img src="/icon-192.png" alt="ID Maîtrise" style={{ width: 60, height: 60, objectFit: 'contain' }} />
        </div>

        <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 700, color: '#0F172A' }}>ID Maîtrise</h1>
        <p style={{ margin: '0 0 8px', fontSize: 13, color: '#64748B' }}>Ingénierie de la construction</p>
        <p style={{ margin: '0 0 32px', fontSize: 12, color: '#94A3B8' }}>Tableau de bord de gestion de chantiers</p>

        {denied && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10,
            padding: '14px 16px', marginBottom: 20, fontSize: 13, color: '#DC2626',
            textAlign: 'left',
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🔒</span> Accès refusé
            </div>
            <div style={{ fontSize: 12, color: '#991B1B', lineHeight: 1.5 }}>
              Votre compte Google n&apos;est pas autorisé pour cet espace.<br/>
              Demande à ton administrateur de t&apos;ajouter via{' '}
              <a href="mailto:contact@id-maitrise.com" style={{ color: '#7C2D12', fontWeight: 600 }}>contact@id-maitrise.com</a>.
            </div>
          </div>
        )}
        {expired && !denied && (
          <div style={{
            background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10,
            padding: '14px 16px', marginBottom: 20, fontSize: 13, color: '#92400E',
            textAlign: 'left',
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>⏱</span> Session expirée
            </div>
            <div style={{ fontSize: 12, color: '#92400E', lineHeight: 1.5 }}>
              Votre session a expiré par mesure de sécurité. Reconnectez-vous avec votre compte Google pour continuer.
            </div>
          </div>
        )}
        {error && !denied && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10,
            padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#DC2626',
          }}>
            ⚠ {error}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={loggingIn}
          aria-label="Se connecter avec Google"
          style={{
            width: '100%', padding: '14px 24px', borderRadius: 12,
            border: '1.5px solid #E2E8F0', background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            cursor: loggingIn ? 'wait' : 'pointer', fontSize: 15, fontWeight: 600,
            color: '#334155', fontFamily: 'inherit',
            transition: 'border-color .2s, box-shadow .2s, transform .1s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(59,130,246,0.2)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)' }}
          onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.98)' }}
          onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
        >
          {loggingIn ? (
            <>
              <span style={{ width: 18, height: 18, border: '2px solid #E2E8F0', borderTopColor: '#3B82F6', borderRadius: '50%', display: 'inline-block', animation: 'spin .8s linear infinite' }}/>
              Connexion en cours…
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Se connecter avec Google
            </>
          )}
        </button>

        <p style={{ margin: '24px 0 0', fontSize: 11, color: '#94A3B8' }}>
          Accès réservé aux collaborateurs et maîtres d&apos;ouvrage ID Maîtrise
        </p>

        <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid #F1F5F9' }}>
          <p style={{ margin: 0, fontSize: 10, color: '#94A3B8' }}>
            SARL ID MAÎTRISE — 9 Rue Henry Genestal, 76600 Le Havre<br />
            SIRET 921 536 181 00024
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── LOGOUT ───
// Flag posé dans sessionStorage pour différencier un logout volontaire
// d'une expiration de session. AuthProvider le lit au SIGNED_OUT suivant.
export async function logout() {
  try { sessionStorage.setItem('idm_voluntary_logout', '1') } catch {}
  await supabase.auth.signOut()
}
