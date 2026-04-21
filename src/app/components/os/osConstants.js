// Constantes partagées entre OrdresServiceV (page) et OsCard / OsStatusPills.

// Ordre canonique des statuts (utilisé dans le filtre et le dropdown de tri)
export const OS_STATUSES = ["Brouillon", "Émis", "Signé", "En cours", "Terminé", "Annulé"]

export const osStatusColor = {
  "Brouillon": "#94A3B8",
  "Émis":      "#3B82F6",
  "Signé":     "#8B5CF6",
  "En cours":  "#F59E0B",
  "Terminé":   "#10B981",
  "Annulé":    "#EF4444",
}

// Style "pastille" pour les boutons d'action sur les cartes OS.
// Remplace les boutons saturés (rouge/vert/violet plein) par des versions
// plus douces, plus cohérentes visuellement.
export const osBtn = (color, bg, border) => ({
  background: bg,
  border: `1px solid ${border}`,
  borderRadius: 6,
  padding: "4px 10px",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 600,
  color,
  fontFamily: "inherit",
})
