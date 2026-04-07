'use client'
import { useState } from 'react'
import AdminDashboard from './dashboards/AdminDashboard'
import SalarieDashboard from './dashboards/SalarieDashboard'
import ClientDashboard from './dashboards/ClientDashboard'

const TABS = [
  { key: 'admin',   label: 'Admin',   icon: '⚙️' },
  { key: 'salarie', label: 'Salarié', icon: '👷' },
  { key: 'client',  label: 'Client',  icon: '🏗️' },
]

export default function RoleBasedDashboard({ user, profile = null }) {
  const [activeRole, setActiveRole] = useState(profile?.role || 'admin')

  const fakeProfile = { ...profile, role: activeRole }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      {/* Barre d'onglets */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: '#1E3A5F',
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '8px 16px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}>
        <span style={{ color: '#94A3B8', fontSize: 12, marginRight: 8 }}>Vue :</span>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveRole(tab.key)}
            style={{
              padding: '6px 18px', borderRadius: 8, border: 'none',
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
              fontFamily: 'inherit',
              background: activeRole === tab.key ? '#fff' : 'transparent',
              color: activeRole === tab.key ? '#1E3A5F' : '#94A3B8',
              transition: 'all 0.15s',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', color: '#64748B', fontSize: 11 }}>
          {user?.email}
        </span>
      </div>

      {/* Contenu selon l'onglet actif */}
      {activeRole === 'admin'   && <AdminDashboard   user={user} profile={fakeProfile} />}
      {activeRole === 'salarie' && <SalarieDashboard user={user} profile={fakeProfile} />}
      {activeRole === 'client'  && <ClientDashboard  user={user} profile={fakeProfile} />}
    </div>
  )
}
