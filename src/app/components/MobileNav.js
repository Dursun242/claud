'use client'
import { useEffect } from 'react'
import { Icon, I } from '../dashboards/shared'

// Hauteur de la barre (hors safe-area iOS) — utilisée par les dashboards
// pour réserver l'espace en bas du contenu et remonter le micro flottant.
export const MOBILE_NAV_HEIGHT = 62

/**
 * Barre de navigation fixe en bas d'écran (mobile uniquement).
 * Accès au pouce aux onglets les plus utilisés sur le terrain ; le reste
 * reste dans le menu latéral (bouton « Plus »).
 *
 * @param items    [{ key, label, icon }] — 3 ou 4 onglets
 * @param active   clé de l'onglet actif
 * @param onSelect (key) => void
 * @param onMenu   () => void — ouvre le menu latéral complet
 * @param onCreate () => void — optionnel, affiche le bouton central « + »
 */
export default function MobileNav({ items, active, onSelect, onMenu, onCreate }) {
  const half = Math.ceil(items.length / 2)
  const left = onCreate ? items.slice(0, half) : items
  const right = onCreate ? items.slice(half) : []
  const menuActive = !items.some(i => i.key === active)

  const tabBtn = (it) => {
    const on = it.key === active
    return (
      <button key={it.key} data-nav onClick={() => onSelect(it.key)}
        aria-current={on ? 'page' : undefined}
        style={{ ...itemStyle, color: on ? '#0071E3' : '#6E6E73', fontWeight: on ? 600 : 500 }}>
        <Icon d={it.icon} size={22} color={on ? '#0071E3' : '#8E8E93'} />
        <span style={labelStyle}>{it.label}</span>
      </button>
    )
  }

  return (
    <nav aria-label="Navigation rapide" style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 996,
      height: `calc(${MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom))`,
      paddingBottom: 'env(safe-area-inset-bottom)',
      // Barre d'onglets translucide façon iOS
      background: 'rgba(249,249,251,0.88)',
      backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)',
      borderTop: '1px solid rgba(0,0,0,0.1)',
      display: 'flex', alignItems: 'stretch',
    }}>
      {left.map(tabBtn)}
      {onCreate && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button data-nav onClick={onCreate} aria-label="Créer (OS, CR, tâche…)" style={{
            width: 48, height: 48, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: '#0071E3', color: '#fff',
            boxShadow: '0 4px 12px rgba(0,113,227,0.3)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon d={I.plus} size={24} color="#fff" />
          </button>
        </div>
      )}
      {right.map(tabBtn)}
      <button data-nav onClick={onMenu} aria-label="Plus d'onglets"
        style={{ ...itemStyle, color: menuActive ? '#0071E3' : '#6E6E73', fontWeight: menuActive ? 600 : 500 }}>
        <Icon d={I.menu} size={22} color={menuActive ? '#0071E3' : '#8E8E93'} />
        <span style={labelStyle}>Plus</span>
      </button>
    </nav>
  )
}

const itemStyle = {
  flex: 1, minWidth: 0, border: 'none', background: 'none', cursor: 'pointer',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  gap: 3, padding: '6px 2px', fontFamily: 'inherit',
}
const labelStyle = {
  fontSize: 11, lineHeight: 1.1, maxWidth: '100%',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}

/**
 * Menu « Créer » : feuille en bas d'écran sur mobile, panneau centré sur
 * desktop. Chaque action ouvre directement le formulaire de création de
 * l'onglet concerné (cf. lib/navIntent.js).
 *
 * @param actions [{ key, label, hint, icon, onPick }]
 */
export function QuickCreateSheet({ open, onClose, actions, isMobile }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
      animation: 'fadeIn .15s ease',
    }}>
      <div role="dialog" aria-modal="true" aria-label="Créer" onClick={e => e.stopPropagation()} style={{
        background: '#fff', width: '100%', maxWidth: isMobile ? '100%' : 440,
        borderRadius: isMobile ? '18px 18px 0 0' : 16,
        padding: isMobile ? '10px 16px calc(16px + env(safe-area-inset-bottom))' : 20,
        boxShadow: '0 -8px 24px rgba(0,0,0,0.18)',
      }}>
        {isMobile && <div aria-hidden style={{ width: 40, height: 4, borderRadius: 2, background: '#D1D1D6', margin: '0 auto 12px' }} />}
        <div style={{ fontSize: 17, fontWeight: 600, color: '#1C1C1E', marginBottom: 12 }}>Créer…</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
          {actions.map((a, i) => (
            <button key={a.key} autoFocus={i === 0} onClick={() => { onClose(); a.onPick() }} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px', minHeight: 56,
              border: 'none', borderRadius: 12, background: '#F2F2F7', cursor: 'pointer',
              fontFamily: 'inherit', textAlign: 'left', minWidth: 0,
            }}>
              <span aria-hidden style={{
                width: 36, height: 36, borderRadius: 10, background: '#fff', flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>{a.icon ? <Icon d={a.icon} size={20} color="#0071E3" /> : a.emoji}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#1C1C1E' }}>{a.label}</span>
                {a.hint && <span style={{ display: 'block', fontSize: 12, color: '#6E6E73', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
