// Helpers partagés entre PVRow, PVDetail et PVNewForm : palette de couleurs
// des statuts de signature et de décision + formateur de date FR compact.

export function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function statusColor(statut) {
  switch (statut) {
    case 'Signé':     return { bg: '#EAF8EE', color: '#248A3D', icon: '✓' }
    case 'Envoyé':    return { bg: '#EAF3FF', color: '#0077B6', icon: '⏳' }
    case 'Brouillon': return { bg: '#F2F2F7', color: '#6E6E73', icon: '📝' }
    case 'Refusé':    return { bg: '#FFF0EF', color: '#D70015', icon: '✕' }
    default:          return { bg: '#F2F2F7', color: '#6E6E73', icon: '?' }
  }
}

export function decisionColor(decision) {
  switch (decision) {
    case 'Accepté':              return { bg: '#EAF8EE', color: '#248A3D', icon: '✓' }
    case 'Accepté avec réserve': return { bg: '#FFF0D6', color: '#C93400', icon: '⚠️' }
    case 'Refusé':               return { bg: '#FFF0EF', color: '#D70015', icon: '✕' }
    case 'En attente':           return { bg: '#F2F2F7', color: '#6E6E73', icon: '⏳' }
    default:                     return { bg: '#F2F2F7', color: '#6E6E73', icon: '?' }
  }
}
