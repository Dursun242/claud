// Helpers partagés entre PVRow, PVDetail et PVNewForm : palette de couleurs
// des statuts de signature et de décision + formateur de date FR compact.

export function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function statusColor(statut) {
  switch (statut) {
    case 'Signé':     return { bg: '#ECFDF5', color: '#059669', icon: '✓' }
    case 'Envoyé':    return { bg: '#EFF6FF', color: '#0284C7', icon: '⏳' }
    case 'Brouillon': return { bg: '#F3F4F6', color: '#6B7280', icon: '📝' }
    case 'Refusé':    return { bg: '#FEF2F2', color: '#DC2626', icon: '✕' }
    default:          return { bg: '#F1F5F9', color: '#64748B', icon: '?' }
  }
}

export function decisionColor(decision) {
  switch (decision) {
    case 'Accepté':              return { bg: '#ECFDF5', color: '#059669', icon: '✓' }
    case 'Accepté avec réserve': return { bg: '#FEF3C7', color: '#D97706', icon: '⚠️' }
    case 'Refusé':               return { bg: '#FEF2F2', color: '#DC2626', icon: '✕' }
    case 'En attente':           return { bg: '#F1F5F9', color: '#64748B', icon: '⏳' }
    default:                     return { bg: '#F1F5F9', color: '#64748B', icon: '?' }
  }
}
