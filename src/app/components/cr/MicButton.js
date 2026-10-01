'use client'
/** Bouton de dictée d'un champ (voir hooks/useDictation). */
export default function MicButton({ active, onClick, label = 'Dicter' }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} title={active ? 'Arrêter la dictée' : label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '6px 12px', minHeight: 34,
        fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        border: active ? '1.5px solid #DC2626' : '1.5px solid #CBD5E1',
        background: active ? '#FEF2F2' : '#fff', color: active ? '#DC2626' : '#1E3A5F',
      }}>
      <span aria-hidden="true" style={{
        width: 8, height: 8, borderRadius: '50%', background: active ? '#DC2626' : '#94A3B8',
        animation: active ? 'heartbeat 0.8s ease-in-out infinite' : 'none',
      }} />
      {active ? 'Arrêter' : `🎤 ${label}`}
    </button>
  )
}
