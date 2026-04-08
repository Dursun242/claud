'use client'
import AdminDashboard from './dashboards/AdminDashboard'
import ClientDashboard from './dashboards/ClientDashboard'

export default function RoleBasedDashboard({ user, profile = null }) {
  const role = profile?.role || 'salarie'

  // admin & salarie → même dashboard, l'onglet Admin est masqué pour les salariés
  if (role === 'client') return <ClientDashboard user={user} profile={profile} />
  return <AdminDashboard user={user} profile={profile} />
}
