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
        style={{ ...itemStyle, color: on ? '#1E3A5F' : '#64748B', fontWeight: on ? 700 : 500 }}>
        <Icon d={it.icon} size={21} color={on ? '#2563EB' : '#94A3B8'} />
        <span style={labelStyle}>{it.label}</span>
      </button>
    )
  }

  return (
    <nav aria-label="Navigation rapide" style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 996,
      height: `calc(${MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom))`,
      paddingBottom: 'env(safe-area-inset-bottom)',
      background: '#fff', borderTop: '1px solid #E2E8F0',
      boxShadow: '0 -2px 10px rgba(15,23,42,0.05)',
      display: 'flex', alignItems: 'stretch',
    }}>
      {left.map(tabBtn)}
      {onCreate && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button data-nav onClick={onCreate} aria-label="Créer (OS, CR, tâche…)" style={{
            width: 50, height: 50, borderRadius: 16, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg,#1E3A5F,#2563EB)', color: '#fff',
            boxShadow: '0 4px 14px rgba(37,99,235,0.35)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon d={I.plus} size={24} color="#fff" />
          </button>
        </div>
      )}
      {right.map(tabBtn)}
      <button data-nav onClick={onMenu} aria-label="Plus d'onglets"
        style={{ ...itemStyle, color: menuActive ? '#1E3A5F' : '#64748B', fontWeight: menuActive ? 700 : 500 }}>
        <Icon d={I.menu} size={21} color={menuActive ? '#2563EB' : '#94A3B8'} />
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
  fontSize: 10.5, lineHeight: 1.1, maxWidth: '100%',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}

/**
 * Menu « Créer » : feuille en bas d'écran sur mobile, panneau centré sur
 * desktop. Chaque action ouvre directement le formulaire de création de
 * l'onglet concerné (cf. lib/navIntent.js).
 *
 * @param actions [{ key, label, hint, emoji, onPick }]
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
      position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(15,23,42,0.45)',
      display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
      animation: 'fadeIn .15s ease',
    }}>
      <div role="dialog" aria-modal="true" aria-label="Créer" onClick={e => e.stopPropagation()} style={{
        background: '#fff', width: '100%', maxWidth: isMobile ? '100%' : 440,
        borderRadius: isMobile ? '18px 18px 0 0' : 16,
        padding: isMobile ? '10px 16px calc(16px + env(safe-area-inset-bottom))' : 20,
        boxShadow: '0 -8px 40px rgba(0,0,0,0.25)',
      }}>
        {isMobile && <div aria-hidden style={{ width: 40, height: 4, borderRadius: 2, background: '#CBD5E1', margin: '0 auto 12px' }} />}
        <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 12 }}>Créer…</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
          {actions.map((a, i) => (
            <button key={a.key} autoFocus={i === 0} onClick={() => { onClose(); a.onPick() }} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px', minHeight: 56,
              border: '1.5px solid #E2E8F0', borderRadius: 12, background: '#fff', cursor: 'pointer',
              fontFamily: 'inherit', textAlign: 'left', minWidth: 0,
            }}>
              <span aria-hidden style={{
                fontSize: 20, width: 36, height: 36, borderRadius: 10, background: '#F1F5F9', flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>{a.emoji}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{a.label}</span>
                {a.hint && <span style={{ display: 'block', fontSize: 10.5, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
