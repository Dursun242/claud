'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { logout } from '../auth'

export default function ClientDashboard({ user, profile = null }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: chantiers } = await supabase
          .from('chantiers')
          .select('*')
          .eq('client_id', user.id)
          .order('created_at', { ascending: false })

        setData({ chantiers: chantiers || [], contacts: [], tasks: [], planning: [], rdv: [], compteRendus: [], ordresService: [] })
      } catch (err) {
        console.error('Erreur:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [user.id])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>⏳ Chargement...</div>

  return (
    <main style={{ minHeight: '100vh', background: '#0F172A' }}>
      <div style={{ background: '#1E293B', borderBottom: '1px solid #334155', padding: '12px 20px', display: 'flex', gap: '8px' }}>
        <button style={{ padding: '8px 12px', background: '#3B82F6', color: '#FFF', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>📊 Mes chantiers</button>
        <button onClick={() => logout()} style={{ marginLeft: 'auto', padding: '8px 12px', background: '#EF4444', color: '#FFF', border: 'none', cursor: 'pointer', borderRadius: '4px' }}>🚪 Déconnexion</button>
      </div>
      <div style={{ padding: '20px', color: '#E2E8F0' }}>
        <h1>Espace Client</h1>
        <p>Vos chantiers: {data?.chantiers?.length || 0}</p>
      </div>
    </main>
  )
}
