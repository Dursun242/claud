// Constantes partagées entre OrdresServiceV (page) et OsCard / OsStatusPills.

// Ordre canonique des statuts (utilisé dans le filtre et le dropdown de tri)
export const OS_STATUSES = ["Brouillon", "Émis", "Signé", "En cours", "Terminé", "Annulé"]

export const osStatusColor = {
  "Brouillon": "#8E8E93",
  "Émis":      "#007AFF",
  "Signé":     "#AF52DE",
  "En cours":  "#FF9500",
  "Terminé":   "#34C759",
  "Annulé":    "#FF3B30",
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
