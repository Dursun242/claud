'use client'

/**
 * KeyboardHelpModal — modale qui liste tous les raccourcis clavier de l'app.
 * Déclenchée par la touche « ? ».
 *
 * Extrait depuis AdminDashboard.js pour garder le shell propre.
 * Réutilisé aussi dans ClientDashboard.js.
 *
 * Props :
 * - open    : boolean
 * - onClose : () => void
 * - tabs    : [{ key, label, sc }] — liste des onglets avec leur raccourci
 */
export default function KeyboardHelpModal({ open, onClose, tabs = [] }) {
  if (!open) return null

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0,
      background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)",
      zIndex: 5000,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
      animation: "fadeIn .15s ease",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 14,
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        width: "100%", maxWidth: 460,
        padding: "20px 24px 22px",
        fontFamily: "'DM Sans',sans-serif",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A" }}>Raccourcis clavier</div>
            <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>Naviguer plus vite dans l&apos;app</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{
              background: "#F1F5F9", border: "none",
              width: 28, height: 28, borderRadius: 6,
              cursor: "pointer", color: "#64748B", fontSize: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Raccourcis globaux */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Global</div>
            {[
              { k: ["Ctrl", "K"], label: "Recherche globale" },
              { k: ["/"],         label: "Focus la recherche" },
              { k: ["?"],         label: "Afficher cette aide" },
              { k: ["Esc"],       label: "Fermer / annuler" },
            ].map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0" }}>
                <span style={{ fontSize: 13, color: "#334155" }}>{r.label}</span>
                <span style={{ display: "flex", gap: 4 }}>{r.k.map((key, j) => (<kbd key={j} style={KBD}>{key}</kbd>))}</span>
              </div>
            ))}
          </div>

          {/* Aller à (g + lettre) */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
              Aller à (appuie sur <kbd style={KBD}>g</kbd> puis…)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "4px 16px" }}>
              {tabs.map(t => (
                <div key={t.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
                  <span style={{ fontSize: 12, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</span>
                  <kbd style={KBD}>{t.sc}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Style partagé pour les touches affichées dans la modale
const KBD = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  minWidth: 22, height: 22, padding: "0 6px",
  background: "#F1F5F9", border: "1px solid #CBD5E1", borderBottomWidth: 2,
  borderRadius: 5, fontSize: 11, fontWeight: 600, color: "#334155",
  fontFamily: "'DM Sans',sans-serif",
}
