'use client'

// Champ de recherche des listes (Chantiers, Tâches, CR, OS), façon iOS :
// fond gris sans trait, loupe grise, coins de 10 px. Au téléphone : 44 px
// de haut et texte en 16 px (en dessous, Safari zoome sur le champ).

export default function SearchField({ inputRef, value, onChange, placeholder, label = 'Rechercher', m, width = 260 }) {
  return (
    <div style={{ position: 'relative', width: m ? '100%' : width }}>
      <svg aria-hidden="true" style={{
        position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none',
      }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8E8E93" strokeWidth="2.5" strokeLinecap="round">
        <circle cx="11" cy="11" r="7.5" />
        <path d="M21 21l-4.5-4.5" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        style={{
          width: '100%', boxSizing: 'border-box', height: m ? 44 : 36,
          padding: '0 10px 0 32px', borderRadius: 10, border: 'none',
          background: '#EFEFF0', color: '#1C1C1E',
          fontSize: m ? 16 : 14, fontFamily: 'inherit',
        }}
      />
    </div>
  )
}

// Liste déroulante de la barre d'outils (tri, filtre par chantier), assortie
// au champ de recherche.
export const toolbarSelect = (m) => ({
  height: m ? 44 : 36, padding: '0 10px', borderRadius: 10, border: 'none',
  background: '#EFEFF0', color: '#1C1C1E', fontSize: m ? 16 : 14,
  fontFamily: 'inherit', cursor: 'pointer', maxWidth: m ? '100%' : 220,
})
