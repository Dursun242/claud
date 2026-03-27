'use client'
import { useState, useEffect, Suspense } from 'react'
import { supabase } from '../supabaseClient'
import DashboardV from '../pages/DashboardV'
import ProjectsV from '../pages/ProjectsV'
import PlanningV from '../pages/PlanningV'
import TasksV from '../pages/TasksV'
import ReportsV from '../pages/ReportsV'
import OrdresServiceV from '../pages/OrdresServiceV'
import GCalV from '../pages/GCalV'
import PlansV from '../pages/PlansV'
import PhotoReportsV from '../pages/PhotoReportsV'
import { logout } from '../auth'

export default function ClientDashboard({ user, profile }) {
  const [tab, setTab] = useState('dashboard')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 900

  // Charger uniquement les données du client
  useEffect(() => {
    const loadData = async () => {
      try {
        // Récupérer seulement les chantiers du client
        const { data: chantiers } = await supabase
          .from('chantiers')
          .select('*')
          .eq('client_id', user.id)
          .order('created_at', { ascending: false })

        const chantiersIds = (chantiers || []).map(c => c.id)

        // Charger les tâches, planning, RDV, comptes rendus pour ces chantiers
        const [taData, plData, rvData, crData, osData] = await Promise.all([
          supabase.from('taches').select('*').in('chantier_id', chantiersIds || [null]),
          supabase.from('planning').select('*').in('chantier_id', chantiersIds || [null]),
          supabase.from('rdv').select('*').in('chantier_id', chantiersIds || [null]),
          supabase.from('compte_rendus').select('*').in('chantier_id', chantiersIds || [null]),
          supabase.from('ordres_service').select('*').in('chantier_id', chantiersIds || [null]),
        ])

        setData({
          chantiers: (chantiers || []).map(c => ({ ...c, lots: c.lots || [] })),
          contacts: [], // Clients ne voient pas la liste de contacts complète
          tasks: (taData.data || []).map(t => ({ ...t, chantierId: t.chantier_id })),
          planning: (plData.data || []).map(p => ({ ...p, chantierId: p.chantier_id })),
          rdv: (rvData.data || []).map(r => ({ ...r, chantierId: r.chantier_id, participants: r.participants || [] })),
          compteRendus: (crData.data || []).map(c => ({ ...c, chantierId: c.chantier_id })),
          ordresService: osData.data || [],
        })
      } catch (err) {
        console.error('Erreur chargement données client:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [user.id])

  const reload = async () => {
    setLoading(true)
    const { data: chantiers } = await supabase
      .from('chantiers')
      .select('*')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })

    const chantiersIds = (chantiers || []).map(c => c.id)
    const [taData, plData, rvData, crData, osData] = await Promise.all([
      supabase.from('taches').select('*').in('chantier_id', chantiersIds || [null]),
      supabase.from('planning').select('*').in('chantier_id', chantiersIds || [null]),
      supabase.from('rdv').select('*').in('chantier_id', chantiersIds || [null]),
      supabase.from('compte_rendus').select('*').in('chantier_id', chantiersIds || [null]),
      supabase.from('ordres_service').select('*').in('chantier_id', chantiersIds || [null]),
    ])

    setData({
      chantiers: (chantiers || []).map(c => ({ ...c, lots: c.lots || [] })),
      contacts: [],
      tasks: (taData.data || []).map(t => ({ ...t, chantierId: t.chantier_id })),
      planning: (plData.data || []).map(p => ({ ...p, chantierId: p.chantier_id })),
      rdv: (rvData.data || []).map(r => ({ ...r, chantierId: r.chantier_id, participants: r.participants || [] })),
      compteRendus: (crData.data || []).map(c => ({ ...c, chantierId: c.chantier_id })),
      ordresService: osData.data || [],
    })
    setLoading(false)
  }

  if (loading || !data) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>⏳ Chargement...</div>
  }

  return (
    <main style={{ minHeight: '100vh', background: '#0F172A' }}>
      {/* Header */}
      <div style={{ background: '#1E293B', borderBottom: '1px solid #334155', padding: '12px 20px', display: 'flex', gap: '8px', overflowX: 'auto' }}>
        {[
          { id: 'dashboard', label: '📊 Vue générale' },
          { id: 'projects', label: '🏗️ Mes chantiers' },
          { id: 'planning', label: '📅 Planning' },
          { id: 'reports', label: '📋 Comptes Rendus' },
          { id: 'os', label: '📝 Ordres Service' },
          { id: 'plans', label: '📐 Plans' },
          { id: 'photos', label: '📸 Reportages' },
          { id: 'gcal', label: '📅 Agenda' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 12px',
              background: tab === t.id ? '#3B82F6' : 'transparent',
              border: 'none',
              color: '#E2E8F0',
              cursor: 'pointer',
              borderRadius: '4px',
              fontSize: '13px',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={() => logout()}
          style={{
            marginLeft: 'auto',
            padding: '8px 12px',
            background: '#EF4444',
            border: 'none',
            color: '#FFF',
            cursor: 'pointer',
            borderRadius: '4px',
            fontSize: '13px',
          }}
        >
          🚪 Déconnexion
        </button>
      </div>

      {/* Contenu */}
      <div style={{ animation: 'fadeIn .3s ease', maxWidth: 1200, margin: '0 auto', padding: '20px' }}>
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>⏳ Chargement...</div>}>
          {tab === 'dashboard' && <DashboardV data={data} setTab={setTab} m={isMobile} user={user} />}
          {tab === 'projects' && <ProjectsV data={data} save={() => {}} m={isMobile} reload={reload} />}
          {tab === 'planning' && <PlanningV data={data} m={isMobile} />}
          {tab === 'reports' && <ReportsV data={data} save={() => {}} m={isMobile} reload={reload} />}
          {tab === 'os' && <OrdresServiceV data={data} m={isMobile} reload={reload} />}
          {tab === 'plans' && <PlansV data={data} m={isMobile} reload={reload} user={user} />}
          {tab === 'photos' && <PhotoReportsV data={data} m={isMobile} reload={reload} user={user} />}
          {tab === 'gcal' && <GCalV m={isMobile} />}
        </Suspense>
      </div>
    </main>
  )
}
