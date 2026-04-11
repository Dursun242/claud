'use client'
import { QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth, LoginPage } from './auth'
import Dashboard from './dashboard'
import { queryClient } from './queryClient'
import ErrorBoundary from './components/ErrorBoundary'

function ProtectedApp() {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)',
        fontFamily: "'DM Sans', sans-serif"
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 52, height: 52, border: '4px solid #E2E8F0', borderTopColor: '#1E3A5F',
            borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 18px'
          }} aria-hidden="true"/>
          <p style={{ margin: 0, color: '#1E3A5F', fontSize: 15, fontWeight: 600 }}>ID Maîtrise</p>
          <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: 12 }}>Vérification de votre accès…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    )
  }

  if (!user) return <LoginPage />

  return <Dashboard user={user} profile={profile} />
}

export default function Page() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ProtectedApp />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
