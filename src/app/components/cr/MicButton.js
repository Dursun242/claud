'use client'
/** Bouton de dictée d'un champ (voir hooks/useDictation). */
export default function MicButton({ active, onClick, label = 'Dicter' }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} title={active ? 'Arrêter la dictée' : label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '6px 12px', minHeight: 34,
        fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        border: active ? '1.5px solid #D70015' : '1.5px solid #D1D1D6',
        background: active ? '#FFF0EF' : '#fff', color: active ? '#D70015' : '#0071E3',
      }}>
      <span aria-hidden="true" style={{
        width: 8, height: 8, borderRadius: '50%', background: active ? '#D70015' : '#8E8E93',
        animation: active ? 'heartbeat 0.8s ease-in-out infinite' : 'none',
      }} />
      {active ? 'Arrêter' : `${label}`}
    </button>
  )
}
