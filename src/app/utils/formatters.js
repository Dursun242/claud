/**
 * Utilitaires de formatage
 * Uniformise la présentation des données dans l'app
 */

// Formatage des montants en euros
export const formatMoney = (amount) => {
  if (!amount && amount !== 0) return '—'
  const num = Number(amount)
  const fixed = Math.abs(num).toFixed(2)
  const [whole, dec] = fixed.split('.')
  const withSep = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return (num < 0 ? '-' : '') + withSep + ',' + dec + ' €'
}

// Formatage des dates
export const formatDate = (date, locale = 'fr-FR') => {
  if (!date) return '—'
  try {
    return new Date(date).toLocaleDateString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return date
  }
}

export const formatDateTime = (date, locale = 'fr-FR') => {
  if (!date) return '—'
  try {
    return new Date(date).toLocaleDateString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return date
  }
}

// Formatage des pourcentages
export const formatPercent = (value, decimals = 1) => {
  if (value === null || value === undefined) return '—'
  return (Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals)).toFixed(decimals) + '%'
}

// Tronque le texte
export const truncate = (text, length = 50) => {
  if (!text) return '—'
  return text.length > length ? text.substring(0, length) + '...' : text
}

// Formate les nombres avec séparateurs
export const formatNumber = (num) => {
  if (!num && num !== 0) return '—'
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

// Formate la durée
export const formatDuration = (ms) => {
  if (!ms) return '0s'
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

// Obtient le statut avec label
export const getStatusLabel = (status) => {
  const labels = {
    pending: 'En attente',
    ongoing: 'En cours',
    completed: 'Terminé',
    error: 'Erreur',
    success: 'Succès',
    warning: 'Attention',
  }
  return labels[status] || status
}
