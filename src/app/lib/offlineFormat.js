// Date + heure courtes en français (« 29 sept. à 14:05 »)
export function fmtDateTime(ts) {
  try {
    const d = new Date(ts)
    return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  } catch { return '' }
}
