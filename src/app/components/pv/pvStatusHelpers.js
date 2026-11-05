// Helpers partagés entre PVRow, PVDetail et PVNewForm : palette de couleurs
// des statuts de signature et de décision + formateur de date FR compact.

export function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function statusColor(statut) {
  switch (statut) {
    case 'Signé':     return { bg: '#EAF8EE', color: '#1E7B34' }
    case 'Envoyé':    return { bg: '#EAF3FF', color: '#0066CC' }
    case 'Brouillon': return { bg: '#F2F2F7', color: '#6E6E73' }
    case 'Refusé':    return { bg: '#FFF0EF', color: '#D70015' }
    default:          return { bg: '#F2F2F7', color: '#6E6E73' }
  }
}

export function decisionColor(decision) {
  switch (decision) {
    case 'Accepté':              return { bg: '#EAF8EE', color: '#1E7B34' }
    case 'Accepté avec réserve': return { bg: '#FFF7E8', color: '#C93400' }
    case 'Refusé':               return { bg: '#FFF0EF', color: '#D70015' }
    case 'En attente':           return { bg: '#F2F2F7', color: '#6E6E73' }
    default:                     return { bg: '#F2F2F7', color: '#6E6E73' }
  }
}
