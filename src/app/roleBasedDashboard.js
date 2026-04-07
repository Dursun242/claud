'use client'
import AdminDashboard from './dashboards/AdminDashboard'
import SalarieDashboard from './dashboards/SalarieDashboard'
import ClientDashboard from './dashboards/ClientDashboard'

export default function RoleBasedDashboard({ user, profile = null }) {
  const role = profile?.role || 'salarie'

  switch (role) {
    case 'admin':
      return <AdminDashboard user={user} profile={profile} />
    case 'client':
      return <ClientDashboard user={user} profile={profile} />
    case 'salarie':
    default:
      return <SalarieDashboard user={user} profile={profile} />
  }
}
