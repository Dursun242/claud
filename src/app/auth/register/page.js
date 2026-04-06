'use client'

import { useState } from 'react'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    setError('')

    try {
      const res = await fetch(`/api/auth/add-user?email=${encodeURIComponent(email)}`)
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Une erreur est survenue')
        return
      }

      setMessage(`✅ Email ${email} ajouté avec succès !`)
      setEmail('')

      // Redirect to login after 2 seconds
      setTimeout(() => {
        window.location.href = '/'
      }, 2000)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0F172A 0%, #1E3A5F 50%, #0F172A 100%)',
      fontFamily: "'DM Sans', sans-serif",
      padding: 20,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 24,
        padding: '48px 40px',
        maxWidth: 420,
        width: '100%',
        boxShadow: '0 25px 80px rgba(0,0,0,0.4)',
      }}>
        <div style={{
          textAlign: 'center',
          marginBottom: 32,
        }}>
          <h1 style={{
            margin: '0 0 8px',
            fontSize: 26,
            fontWeight: 700,
            color: '#0F172A'
          }}>
            Autoriser l'accès
          </h1>
          <p style={{
            margin: 0,
            fontSize: 13,
            color: '#64748B'
          }}>
            Entrez votre email Google pour accéder au dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="votre.email@gmail.com"
            required
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              border: '1.5px solid #E2E8F0',
              fontSize: 14,
              fontFamily: 'inherit',
              outline: 'none',
              boxSizing: 'border-box',
              width: '100%',
            }}
          />

          <button
            type="submit"
            disabled={loading || !email}
            style={{
              padding: '12px 24px',
              borderRadius: 8,
              border: 'none',
              background: '#1E3A5F',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              opacity: loading || !email ? 0.6 : 1,
            }}
          >
            {loading ? 'Ajout en cours...' : 'Autoriser cet email'}
          </button>
        </form>

        {message && (
          <div style={{
            marginTop: 16,
            padding: 12,
            background: '#D1FAE5',
            border: '1px solid #6EE7B7',
            borderRadius: 8,
            color: '#065F46',
            fontSize: 13,
            textAlign: 'center',
          }}>
            {message}
          </div>
        )}

        {error && (
          <div style={{
            marginTop: 16,
            padding: 12,
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: 8,
            color: '#DC2626',
            fontSize: 13,
            textAlign: 'center',
          }}>
            ❌ {error}
          </div>
        )}

        <p style={{
          marginTop: 24,
          fontSize: 11,
          color: '#CBD5E1',
          textAlign: 'center',
          margin: '24px 0 0',
        }}>
          Utilisez l'email avec lequel vous venez de vous connecter
        </p>
      </div>
    </div>
  )
}
