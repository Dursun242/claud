'use client'
import { useState, useEffect, createContext, useContext } from 'react'
import { supabase } from './supabaseClient'

// ─── AUTH CONTEXT ───
const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

// ─── LOAD USER PROFILE ───
async function loadUserProfile(userId) {
  const { data, error } = await supabase
    .from('app_users')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) {
    console.error('Error loading profile:', error)
    return null
  }
  return data
}

// ─── AUTH PROVIDER ───
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const profile = await loadUserProfile(session.user.id)
        if (profile) {
          console.log("✅ Connecté:", profile.prenom, profile.email, "(" + profile.role + ")")
          setUser(session.user)
          setProfile(profile)
          setDenied(false)
        } else {
          console.log("⚠️ Utilisateur non autorisé:", session.user.email)
          setDenied(true)
          setUser(null)
        }
      }
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const profile = await loadUserProfile(session.user.id)
        if (profile) {
          console.log("✅ Auth change:", profile.prenom)
          setUser(session.user)
          setProfile(profile)
          setDenied(false)
        } else {
          setDenied(true)
          setUser(null)
          setProfile(null)
        }
      } else {
        setUser(null)
        setProfile(null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ user, profile, loading, denied }}>
      {children}
    </AuthContext.Provider>
  )
}

// ─── LOGIN PAGE ───
export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)
  const [error, setError] = useState('')
  const { denied } = useAuth()

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoggingIn(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError(signInError.message)
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
        @keyframes neonPulse { 0%,100% { box-shadow: 0 0 20px rgba(0,255,136,0.15); } 50% { box-shadow: 0 0 40px rgba(0,255,136,0.3); } }
      `}</style>

      <div style={{
        background: '#fff', borderRadius: 24, padding: '48px 40px', maxWidth: 420, width: '100%',
        boxShadow: '0 25px 80px rgba(0,0,0,0.4)', animation: 'fadeIn 0.5s ease',
        textAlign: 'center',
      }}>
        {/* Logo ampoule */}
        <div style={{
          width: 80, height: 80, borderRadius: 20,
          background: '#F8FAFC',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
          overflow: 'hidden',
        }}>
          <img src="/icon-192.png" alt="ID Maîtrise" style={{ width: 60, height: 60, objectFit: 'contain' }} />
        </div>

        <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 700, color: '#0F172A' }}>
          ID Maîtrise
        </h1>
        <p style={{ margin: '0 0 8px', fontSize: 13, color: '#64748B' }}>
          Ingénierie de la construction
        </p>
        <p style={{ margin: '0 0 32px', fontSize: 12, color: '#94A3B8' }}>
          Tableau de bord de gestion de chantiers
        </p>

        {/* Error messages */}
        {denied && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10,
            padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#DC2626',
          }}>
            Accès refusé. Votre email n'est pas autorisé.<br/>
            <span style={{ fontSize: 11, color: '#94A3B8' }}>Contactez l'administrateur pour obtenir l'accès.</span>
          </div>
        )}
        {error && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10,
            padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#DC2626',
          }}>
            {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} style={{ marginBottom: 20 }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 4, textTransform: 'uppercase' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="dursun@example.com"
              disabled={loggingIn}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: '1.5px solid #E2E8F0', fontSize: 14, fontFamily: 'inherit',
                outline: 'none', boxSizing: 'border-box',
              }}
              required
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748B', marginBottom: 4, textTransform: 'uppercase' }}>Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loggingIn}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: '1.5px solid #E2E8F0', fontSize: 14, fontFamily: 'inherit',
                outline: 'none', boxSizing: 'border-box',
              }}
              required
            />
          </div>
          <button
            type="submit"
            disabled={loggingIn}
            style={{
              width: '100%', padding: '12px 24px', borderRadius: 8,
              background: '#1E3A5F', color: '#fff', border: 'none',
              cursor: loggingIn ? 'wait' : 'pointer', fontSize: 15, fontWeight: 600,
              transition: 'all 0.2s', fontFamily: 'inherit',
            }}
            onMouseEnter={e => !loggingIn && (e.target.style.background = '#0F172A')}
            onMouseLeave={e => !loggingIn && (e.target.style.background = '#1E3A5F')}
          >
            {loggingIn ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <p style={{ margin: '24px 0 0', fontSize: 11, color: '#CBD5E1' }}>
          Accès réservé aux collaborateurs ID Maîtrise
        </p>

        {/* Footer */}
        <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid #F1F5F9' }}>
          <p style={{ margin: 0, fontSize: 10, color: '#94A3B8' }}>
            SARL ID MAÎTRISE — 9 Rue Henry Genestal, 76600 Le Havre<br/>
            SIRET 921 536 181 00024
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── LOGOUT FUNCTION ───
export async function logout() {
  await supabase.auth.signOut()
}
