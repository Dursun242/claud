'use client'
import { useState, useEffect, Suspense } from 'react'
import { supabase } from '../supabaseClient'
import DashboardV from '../pages/DashboardV'
import ProjectsV from '../pages/ProjectsV'
import PlanningV from '../pages/PlanningV'
import TasksV from '../pages/TasksV'
import ContactsV from '../pages/ContactsV'
import ReportsV from '../pages/ReportsV'
import OrdresServiceV from '../pages/OrdresServiceV'
import AdminV from '../pages/AdminV'
import GCalV from '../pages/GCalV'
import QontoV from '../pages/QontoV'
import AIV from '../pages/AIV'
import PlansV from '../pages/PlansV'
import PhotoReportsV from '../pages/PhotoReportsV'
import { logout } from '../auth'

export default function AdminDashboard({ user, profile }) {
  const [tab, setTab] = useState('dashboard')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [floatTranscript, setFloatTranscript] = useState('')
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 900

  // Charger toutes les données
  useEffect(() => {
    const loadData = async () => {
      try {
        const [ch, co, ta, pl, rv, cr, os] = await Promise.all([
          supabase.from('chantiers').select('*').order('created_at', { ascending: false }),
          supabase.from('contacts').select('*').order('nom'),
          supabase.from('taches').select('*').order('created_at', { ascending: false }),
          supabase.from('planning').select('*').order('debut'),
          supabase.from('rdv').select('*').order('date'),
          supabase.from('compte_rendus').select('*').order('date', { ascending: false }),
          supabase.from('ordres_service').select('*').order('created_at', { ascending: false }),
        ])

        setData({
          chantiers: (ch.data || []).map(c => ({ ...c, lots: c.lots || [] })),
          contacts: (co.data || []).map(c => ({ ...c, chantiers: [] })),
          tasks: (ta.data || []).map(t => ({ ...t, chantierId: t.chantier_id })),
          planning: (pl.data || []).map(p => ({ ...p, chantierId: p.chantier_id })),
          rdv: (rv.data || []).map(r => ({ ...r, chantierId: r.chantier_id, participants: r.participants || [] })),
          compteRendus: (cr.data || []).map(c => ({ ...c, chantierId: c.chantier_id })),
          ordresService: os.data || [],
        })
      } catch (err) {
        console.error('Erreur chargement données admin:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const reload = async () => {
    setLoading(true)
    const [ch, co, ta, pl, rv, cr, os] = await Promise.all([
      supabase.from('chantiers').select('*').order('created_at', { ascending: false }),
      supabase.from('contacts').select('*').order('nom'),
      supabase.from('taches').select('*').order('created_at', { ascending: false }),
      supabase.from('planning').select('*').order('debut'),
      supabase.from('rdv').select('*').order('date'),
      supabase.from('compte_rendus').select('*').order('date', { ascending: false }),
      supabase.from('ordres_service').select('*').order('created_at', { ascending: false }),
    ])
    setData({
      chantiers: (ch.data || []).map(c => ({ ...c, lots: c.lots || [] })),
      contacts: (co.data || []).map(c => ({ ...c, chantiers: [] })),
      tasks: (ta.data || []).map(t => ({ ...t, chantierId: t.chantier_id })),
      planning: (pl.data || []).map(p => ({ ...p, chantierId: p.chantier_id })),
      rdv: (rv.data || []).map(r => ({ ...r, chantierId: r.chantier_id, participants: r.participants || [] })),
      compteRendus: (cr.data || []).map(c => ({ ...c, chantierId: c.chantier_id })),
      ordresService: os.data || [],
    })
    setLoading(false)
  }

  const save = async (type, item) => {
    try {
      if (type === 'chantier') {
        await supabase.from('chantiers').upsert(item)
      } else if (type === 'contact') {
        await supabase.from('contacts').upsert(item)
      } else if (type === 'task') {
        await supabase.from('taches').upsert(item)
      }
      reload()
    } catch (err) {
      console.error(`Erreur sauvegarde ${type}:`, err)
    }
  }

  if (loading || !data) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>⏳ Chargement...</div>
  }

  return (
    <main style={{ minHeight: '100vh', background: '#0F172A' }}>
      {/* Header avec tabs */}
      <div style={{ background: '#1E293B', borderBottom: '1px solid #334155', padding: '12px 20px', display: 'flex', gap: '8px', overflowX: 'auto' }}>
        {[
          { id: 'dashboard', label: '📊 Tableau de bord' },
          { id: 'projects', label: '🏗️ Chantiers' },
          { id: 'planning', label: '📅 Planning' },
          { id: 'tasks', label: '✅ Tâches' },
          { id: 'contacts', label: '👥 Contacts' },
          { id: 'reports', label: '📋 Compte Rendus' },
          { id: 'os', label: '📝 Ordres Service' },
          { id: 'plans', label: '📐 Plans' },
          { id: 'photos', label: '📸 Photos' },
          { id: 'gcal', label: '📅 Agenda' },
          { id: 'qonto', label: '💰 Finances' },
          { id: 'ai', label: '🤖 IA' },
          { id: 'admin', label: '⚙️ Admin' },
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
          {tab === 'projects' && <ProjectsV data={data} save={save} m={isMobile} reload={reload} />}
          {tab === 'planning' && <PlanningV data={data} m={isMobile} />}
          {tab === 'tasks' && <TasksV data={data} save={save} m={isMobile} reload={reload} />}
          {tab === 'contacts' && <ContactsV data={data} save={save} m={isMobile} reload={reload} />}
          {tab === 'reports' && <ReportsV data={data} save={save} m={isMobile} reload={reload} />}
          {tab === 'os' && <OrdresServiceV data={data} m={isMobile} reload={reload} />}
          {tab === 'plans' && <PlansV data={data} m={isMobile} reload={reload} user={user} />}
          {tab === 'photos' && <PhotoReportsV data={data} m={isMobile} reload={reload} user={user} />}
          {tab === 'gcal' && <GCalV m={isMobile} />}
          {tab === 'qonto' && <QontoV m={isMobile} data={data} reload={reload} />}
          {tab === 'ai' && <AIV data={data} save={save} m={isMobile} externalTranscript={floatTranscript} clearExternal={() => setFloatTranscript('')} reload={reload} />}
          {tab === 'admin' && <AdminV m={isMobile} reload={reload} profile={profile} />}
        </Suspense>
      </div>
    </main>
  )
}
