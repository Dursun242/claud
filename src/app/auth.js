'use client'
import { useState, useEffect, createContext, useContext } from 'react'
import { supabase } from './supabaseClient'

// ─── AUTH CONTEXT ───
const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

// ─── AUTH PROVIDER ───
// NOTE : la vérification authorized_users est temporairement désactivée.
// Tout compte Google authentifié accède à l'app avec le rôle 'admin'.
// TODO : réactiver loadUserProfile() quand les utilisateurs sont reconfigurés en base.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return

      if (session?.user) {
        // Sauvegarder le token Google Calendar si disponible
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session.provider_token) {
          supabase.from('settings')
            .upsert({ key: 'gcal-token', value: session.provider_token })
            .catch(() => {})
        }

        // Profil par défaut — bypass temporaire de authorized_users
        const defaultProfile = {
          email: session.user.email,
          prenom: session.user.user_metadata?.full_name?.split(' ')[0]
            || session.user.user_metadata?.name?.split(' ')[0]
            || session.user.email.split('@')[0],
          nom: session.user.user_metadata?.full_name?.split(' ').slice(1).join(' ') || '',
          role: 'admin',
          actif: true,
        }

        if (isMounted) {
          setUser(session.user)
          setProfile(defaultProfile)
        }
      } else {
        if (isMounted) {
          setUser(null)
          setProfile(null)
        }
      }

      if (isMounted) setLoading(false)
    })

    return () => {
      isMounted = false
      subscription?.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

// ─── LOGIN PAGE ───
export function LoginPage() {
  const [loggingIn, setLoggingIn] = useState(false)
  const [error, setError] = useState(null)

  const handleGoogleLogin = async () => {
    setLoggingIn(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        scopes: 'https://www.googleapis.com/auth/calendar.readonly',
        queryParams: { access_type: 'offline', prompt: 'consent' },
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
      fontFamily: "'DM Sans', sans-serif", padding: 20,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes fadeIn { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      <div style={{
        background: '#fff', borderRadius: 24, padding: '48px 40px', maxWidth: 420, width: '100%',
        boxShadow: '0 25px 80px rgba(0,0,0,0.4)', animation: 'fadeIn 0.5s ease', textAlign: 'center',
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

        {error && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10,
            padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#DC2626',
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={loggingIn}
          style={{
            width: '100%', padding: '14px 24px', borderRadius: 12,
            border: '1.5px solid #E2E8F0', background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            cursor: loggingIn ? 'wait' : 'pointer', fontSize: 15, fontWeight: 600,
            color: '#334155', fontFamily: 'inherit', transition: 'all 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(59,130,246,0.15)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {loggingIn ? 'Connexion...' : 'Se connecter avec Google'}
        </button>

        <p style={{ margin: '24px 0 0', fontSize: 11, color: '#CBD5E1' }}>
          Accès réservé aux collaborateurs ID Maîtrise
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
export async function logout() {
  await supabase.auth.signOut()
}
