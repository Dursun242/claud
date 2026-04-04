'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../supabaseClient'

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Supabase SDK va automatiquement traiter le code d'autorisation
        // grâce à detectSessionInUrl: true dans la configuration
        const { data, error } = await supabase.auth.getSession()

        if (error) throw error

        if (data?.session) {
          console.log('✓ Session établie avec succès', data.session.user.email)
          // Redirection vers l'accueil (le AuthProvider gère l'accès)
          router.push('/')
        } else {
          console.log('⚠ Pas de session détectée')
          router.push('/')
        }
      } catch (error) {
        console.error('❌ Erreur lors du callback OAuth:', error.message)
        router.push('/')
      }
    }

    handleCallback()
  }, [router])

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: 'linear-gradient(135deg, #0F172A 0%, #1E3A5F 50%, #0F172A 100%)',
    }}>
      <div style={{
        textAlign: 'center',
        color: '#fff',
        fontFamily: "'DM Sans', sans-serif",
      }}>
        <div style={{
          width: 50,
          height: 50,
          border: '4px solid #1E40AF',
          borderTop: '4px solid #3B82F6',
          borderRadius: '50%',
          margin: '0 auto 20px',
          animation: 'spin 1s linear infinite',
        }}/>
        <h2>Finalisation de la connexion...</h2>
        <p style={{ color: '#94A3B8', fontSize: 14 }}>
          Veuillez patienter pendant que nous configurons votre session.
        </p>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </div>
  )
}
