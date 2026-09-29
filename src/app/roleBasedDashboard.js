'use client'
import AdminDashboard from './dashboards/AdminDashboard'
import ClientDashboard from './dashboards/ClientDashboard'
import OfflineBanner from './components/OfflineBanner'
import { useOfflineSync } from './hooks/useOfflineSync'
import { useToast } from './contexts/ToastContext'
import { SB } from './dashboards/shared'

// Modifications faites hors ligne, rejouées au retour du réseau
// (voir lib/offlineStore.js → enqueue).
const OFFLINE_HANDLERS = {
  task: (payload) => SB.upsertTask(payload),
}

export default function RoleBasedDashboard({ user, profile = null }) {
  const role = profile?.role || 'salarie'
  const { addToast } = useToast()
  const { online, pending, restoredAt, flush } = useOfflineSync(
    user?.email, OFFLINE_HANDLERS,
    (n) => addToast(`${n} modification${n > 1 ? 's' : ''} faite${n > 1 ? 's' : ''} hors ligne envoyée${n > 1 ? 's' : ''}`, 'success'),
  )

  // admin & salarie → même dashboard, l'onglet Admin est masqué pour les salariés
  return (
    <>
      <OfflineBanner online={online} pending={pending} restoredAt={restoredAt} onRetry={flush} />
      {role === 'client'
        ? <ClientDashboard user={user} profile={profile} />
        : <AdminDashboard user={user} profile={profile} />}
    </>
  )
}
