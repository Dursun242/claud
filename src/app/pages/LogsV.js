'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { SB, btnS, inp, sel } from '../dashboards/shared'
import { useToast } from '../contexts/ToastContext'
import { useConfirm } from '../contexts/ConfirmContext'

// ─── Journal d'activité (admin uniquement) ───
// Affiche les connexions + modifications effectuées par les utilisateurs.
// Les données proviennent de la table `activity_logs` (migration 006).
// L'accès est garanti par la RLS côté DB (admin-only) ET par le garde de
// rôle ci-dessous (défense en profondeur).

const ACTION_STYLES = {
  login:           { bg: '#ECFDF5', color: '#047857', border: '#A7F3D0', label: 'Connexion' },
  logout:          { bg: '#F1F5F9', color: '#475569', border: '#CBD5E1', label: 'Déconnexion' },
  access_denied:   { bg: '#FEE2E2', color: '#991B1B', border: '#FCA5A5', label: 'Accès refusé' },
  session_expired: { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A', label: 'Session expirée' },
  create:          { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', label: 'Création' },
  update:          { bg: '#FEF3C7', color: '#92400E', border: '#FDE68A', label: 'Modification' },
  delete:          { bg: '#FEF2F2', color: '#B91C1C', border: '#FECACA', label: 'Suppression' },
  duplicate:       { bg: '#F5F3FF', color: '#6D28D9', border: '#DDD6FE', label: 'Duplication' },
  generate_pdf:    { bg: '#FDF4FF', color: '#A21CAF', border: '#F5D0FE', label: 'Génération PDF' },
  generate_excel:  { bg: '#ECFEFF', color: '#0E7490', border: '#A5F3FC', label: 'Génération Excel' },
  view:            { bg: '#F0F9FF', color: '#0369A1', border: '#BAE6FD', label: 'Consultation' },
  view_attachment: { bg: '#F0F9FF', color: '#0369A1', border: '#BAE6FD', label: 'Consultation PJ' },
  view_sign_request:{ bg: '#F5F3FF', color: '#6D28D9', border: '#DDD6FE', label: 'Consultation signature' },
  odoo_sign_send:  { bg: '#F5F3FF', color: '#6D28D9', border: '#DDD6FE', label: 'Envoi signature' },
  odoo_sign_reset: { bg: '#F8FAFC', color: '#475569', border: '#CBD5E1', label: 'Reset signature' },
  send_email:      { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', label: 'Envoi email' },
  contact_tap:     { bg: '#F0FDFA', color: '#0F766E', border: '#99F6E4', label: 'Appel/Email contact' },
  copy:            { bg: '#F8FAFC', color: '#475569', border: '#CBD5E1', label: 'Copie presse-papier' },
  search_pappers:  { bg: '#FFF7ED', color: '#9A3412', border: '#FED7AA', label: 'Recherche Pappers' },
  import_photo:    { bg: '#FDF2F8', color: '#9D174D', border: '#FBCFE8', label: 'Import par photo' },
  ai_action:       { bg: '#F0FDFA', color: '#0F766E', border: '#99F6E4', label: 'Action IA' },
  seed:            { bg: '#F1F5F9', color: '#475569', border: '#CBD5E1', label: 'Initialisation' },
  export_csv:      { bg: '#F5F3FF', color: '#5B21B6', border: '#DDD6FE', label: 'Export CSV' },
}
const ENTITY_LABELS = {
  chantier:     'Chantier',
  contact:      'Contact',
  task:         'Tâche',
  cr:           'Compte rendu',
  os:           'Ordre de service',
  attachment:   'Pièce jointe',
  comment:      'Commentaire',
  share:        'Partage',
  template:     'Template',
  user:         'Utilisateur',
  session:      'Session',
  settings:     'Paramètres',
  storage:      'Storage',
  photo_report: 'Reportage photo',
  system:       'Système',
  ai:           'Assistant IA',
  activity_logs:'Journal',
}

function formatWhen(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch { return iso }
}

function escapeCsv(val) {
  if (val == null) return ''
  const s = String(val)
  if (/[",;\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

export default function LogsV({ m, profile, embedded = false }) {
  const isAdmin = profile?.role === 'admin'
  const { addToast } = useToast()
  const confirm = useConfirm()

  // Filtres
  const [search, setSearch] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')

  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [errorCode, setErrorCode] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [userOptions, setUserOptions] = useState([])    // chargé depuis la DB
  const [expanded, setExpanded] = useState(new Set())   // ids avec metadata dépliée
  const [exporting, setExporting] = useState(false)
  const [purging, setPurging] = useState(false)

  const PAGE_SIZE = 200

  const load = useCallback(async (opts = {}) => {
    const { append = false, before = null } = opts
    append ? setLoadingMore(true) : setLoading(true)
    setError(null); setErrorCode(null)
    try {
      const rows = await SB.getLogs({
        limit: PAGE_SIZE,
        before,
        userEmail: userFilter || null,
        action: actionFilter || null,
        entityType: entityFilter || null,
        search: search || null,
      })
      setHasMore(rows.length === PAGE_SIZE)
      setLogs(prev => append ? [...prev, ...rows] : rows)
    } catch (err) {
      setError(err?.message || 'Chargement impossible.')
      setErrorCode(err?.code || null)
      if (!append) setLogs([])
    } finally {
      append ? setLoadingMore(false) : setLoading(false)
    }
  }, [userFilter, actionFilter, entityFilter, search])

  // Chargement initial + rechargement quand les filtres changent (debounced sur la recherche)
  useEffect(() => {
    if (!isAdmin) return
    const t = setTimeout(() => { load({ append: false }) }, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [isAdmin, load, search])

  // Liste complète des utilisateurs présents dans le journal (depuis la DB,
  // pas juste les 200 logs chargés → filtre cohérent).
  useEffect(() => {
    if (!isAdmin) return
    SB.getLogUsers()
      .then(rows => setUserOptions((rows || []).sort((a, b) =>
        (a.prenom || a.email).localeCompare(b.prenom || b.email))))
      .catch(() => { /* fallback : userOptions reste vide */ })
  }, [isAdmin])

  // Export CSV COMPLET : pagine côté serveur jusqu'à tout ramener
  // (cap à 10 000 lignes pour protéger l'UX). Respecte les filtres
  // actifs et trace l'export lui-même dans le journal.
  const exportCsv = useCallback(async () => {
    if (exporting) return
    setExporting(true)
    try {
      const all = []
      let before = null
      const MAX = 10000
      while (all.length < MAX) {
        const rows = await SB.getLogs({
          limit: 500, before,
          userEmail: userFilter || null,
          action: actionFilter || null,
          entityType: entityFilter || null,
          search: search || null,
        })
        if (!rows.length) break
        all.push(...rows)
        if (rows.length < 500) break
        before = rows[rows.length - 1].created_at
      }
      const headers = ['Date', 'Utilisateur', 'Email', 'Rôle', 'Action', 'Type', 'Libellé', 'ID', 'Metadata', 'Appareil']
      const lines = [headers.join(';')]
      for (const l of all) {
        lines.push([
          formatWhen(l.created_at),
          l.user_prenom || '', l.user_email || '', l.user_role || '',
          ACTION_STYLES[l.action]?.label || l.action,
          ENTITY_LABELS[l.entity_type] || l.entity_type || '',
          l.entity_label || '', l.entity_id || '',
          l.metadata ? JSON.stringify(l.metadata) : '',
          l.user_agent || '',
        ].map(escapeCsv).join(';'))
      }
      const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `journal-activite-${new Date().toISOString().slice(0,10)}.csv`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      // Trace l'export dans le journal (auto-référent assumé)
      SB.log('export_csv', 'activity_logs', null, `Export journal — ${all.length} lignes`, {
        rows: all.length,
        filters: {
          user: userFilter || null, action: actionFilter || null,
          entity: entityFilter || null, search: search || null,
        },
      })
      addToast(`Export CSV — ${all.length} lignes`, 'success')
    } catch (err) {
      addToast('Export impossible : ' + (err?.message || 'erreur'), 'error')
    } finally {
      setExporting(false)
    }
  }, [exporting, userFilter, actionFilter, entityFilter, search, addToast])

  const handlePurge = async () => {
    const ok = await confirm({
      title: 'Purger les logs anciens ?',
      message: 'Supprime toutes les entrées du journal de plus de 90 jours. Action irréversible.',
      confirmLabel: 'Purger (90j)',
      danger: true,
    })
    if (!ok) return
    setPurging(true)
    try {
      const n = await SB.purgeOldLogs(90)
      addToast(`Journal purgé — ${n ?? '?'} entrée(s) supprimée(s)`, 'success')
      load({ append: false })
    } catch (err) {
      addToast('Purge impossible : ' + (err?.message || 'erreur'), 'error')
    } finally {
      setPurging(false)
    }
  }

  const toggleExpanded = (id) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const resetFilters = () => {
    setSearch(''); setUserFilter(''); setActionFilter(''); setEntityFilter('')
  }

  if (!isAdmin) {
    return (
      <div style={{ background: "#FEF2F2", borderRadius: 14, padding: 40, textAlign: "center", border: "1.5px solid #FECACA" }}>
        <h1 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 700, color: "#DC2626" }}>🔒 Accès refusé</h1>
        <p style={{ margin: 0, color: "#94A3B8", fontSize: 14 }}>Seuls les administrateurs peuvent consulter le journal d&apos;activité.</p>
      </div>
    )
  }

  const hasFilters = !!(search || userFilter || actionFilter || entityFilter)

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div>
          {!embedded && (
            <h1 style={{ margin: 0, fontSize: m ? 18 : 24, fontWeight: 700 }}>📋 Journal d&apos;activité</h1>
          )}
          <div style={{ fontSize: 11, color: "#94A3B8", marginTop: embedded ? 0 : 2 }}>
            {embedded
              ? <>Connexions, créations, modifications et suppressions.</>
              : <>Connexions, créations, modifications et suppressions — admin uniquement.</>
            }
            {logs.length > 0 && <> · <strong>{logs.length}</strong> entrée{logs.length > 1 ? 's' : ''}{hasMore ? ' (+)' : ''}</>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => load({ append: false })} disabled={loading} title="Actualiser" style={{ ...btnS, fontSize: 12 }}>
            {loading ? '⏳ Chargement…' : '↻ Actualiser'}
          </button>
          <button onClick={exportCsv} disabled={exporting || logs.length === 0} title="Exporter TOUT le journal filtré en CSV" style={{ ...btnS, fontSize: 12 }}>
            {exporting ? '⏳ Export…' : '⬇ Export CSV'}
          </button>
          <button onClick={handlePurge} disabled={purging} title="Supprimer les entrées de plus de 90 jours" style={{ ...btnS, fontSize: 12, color: '#B91C1C' }}>
            {purging ? '⏳ Purge…' : '🧹 Purger > 90j'}
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div style={{ background: "#fff", borderRadius: 12, padding: m ? 12 : 14, boxShadow: "0 1px 3px rgba(0,0,0,0.04)", marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: m ? "1fr" : "1.5fr 1fr 1fr 1fr", gap: 10 }}>
          <input
            type="search"
            placeholder="Rechercher libellé, utilisateur, email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inp, fontSize: 13 }}
          />
          <select value={userFilter} onChange={e => setUserFilter(e.target.value)} style={{ ...sel, fontSize: 12 }}>
            <option value="">👥 Tous les utilisateurs</option>
            {userOptions.map(u => (
              <option key={u.email} value={u.email}>{u.prenom || u.email} ({u.email})</option>
            ))}
          </select>
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} style={{ ...sel, fontSize: 12 }}>
            <option value="">⚡ Toutes les actions</option>
            {Object.entries(ACTION_STYLES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)} style={{ ...sel, fontSize: 12 }}>
            <option value="">📂 Tous les types</option>
            {Object.entries(ENTITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        {hasFilters && (
          <div style={{ marginTop: 8, textAlign: 'right' }}>
            <button onClick={resetFilters} style={{ background: 'none', border: 'none', color: '#64748B', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
              Réinitialiser les filtres
            </button>
          </div>
        )}
      </div>

      {/* Erreur */}
      {error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#DC2626" }}>
          ⚠ {error}
          <div style={{ fontSize: 11, marginTop: 4, color: '#94A3B8' }}>
            {errorCode === 'MIGRATION_MISSING'
              ? <>La table <code>activity_logs</code> n&apos;existe pas. Exécute la migration <code>007_activity_logs_consolidated.sql</code> dans Supabase (SQL Editor).</>
              : <>Si l&apos;erreur persiste, vérifie que la migration <code>007_activity_logs_consolidated.sql</code> a bien été appliquée.</>
            }
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ background: "#fff", borderRadius: 12, padding: "40px 24px", textAlign: "center", color: "#94A3B8", fontSize: 13 }}>
          <div style={{ width: 32, height: 32, border: "3px solid #E2E8F0", borderTopColor: "#1E3A5F", borderRadius: "50%", animation: "spin .9s linear infinite", margin: "0 auto 10px" }} />
          Chargement du journal…
        </div>
      ) : logs.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 12, padding: "40px 24px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.5 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
            {hasFilters ? 'Aucun résultat' : 'Journal vide'}
          </div>
          <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 14 }}>
            {hasFilters
              ? "Essaie d'élargir les filtres."
              : "Les actions des utilisateurs apparaîtront ici dès qu'ils se connecteront ou modifieront des données."}
          </div>
          {hasFilters && <button onClick={resetFilters} style={{ ...btnS, fontSize: 12 }}>Réinitialiser</button>}
        </div>
      ) : m ? (
        // Vue carte (mobile)
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {logs.map(l => {
            const a = ACTION_STYLES[l.action] || { bg: '#F1F5F9', color: '#475569', border: '#CBD5E1', label: l.action }
            const src = l.metadata?.source
            const isOpen = expanded.has(l.id)
            return (
              <div key={l.id} style={{ background: '#fff', borderRadius: 10, padding: 12, boxShadow: '0 1px 3px rgba(15,23,42,0.05)', borderLeft: `4px solid ${a.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                  <span style={{ background: a.bg, color: a.color, border: `1px solid ${a.border}`, borderRadius: 5, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>
                    {a.label}
                  </span>
                  <span style={{ fontSize: 10, color: '#94A3B8' }}>{formatWhen(l.created_at)}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginBottom: 2 }}>
                  {l.user_prenom || '—'} <span style={{ fontSize: 11, fontWeight: 400, color: '#94A3B8' }}>· {l.user_email}</span>
                </div>
                <div style={{ fontSize: 12, color: '#475569' }}>
                  <span style={{ fontWeight: 600 }}>{ENTITY_LABELS[l.entity_type] || l.entity_type || '—'}</span>
                  {l.entity_label && <> — {l.entity_label}</>}
                  {src === 'ai' && <span style={sourceBadge}>🤖 IA</span>}
                  {src === 'duplicate' && <span style={sourceBadge}>📋 Copie</span>}
                </div>
                {l.metadata && (
                  <>
                    <button onClick={() => toggleExpanded(l.id)}
                      style={{ marginTop: 6, background: 'none', border: 'none', color: '#64748B', fontSize: 10, cursor: 'pointer', padding: 0, fontFamily: 'inherit', textDecoration: 'underline' }}>
                      {isOpen ? '▾ Masquer les détails' : '▸ Afficher les détails'}
                    </button>
                    {isOpen && (
                      <pre style={metaStyle}>{JSON.stringify(l.metadata, null, 2)}</pre>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        // Vue table (desktop)
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', textAlign: 'left', fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Utilisateur</th>
                  <th style={thStyle}>Action</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Libellé</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l, i) => {
                  const a = ACTION_STYLES[l.action] || { bg: '#F1F5F9', color: '#475569', border: '#CBD5E1', label: l.action }
                  const hasMeta = l.metadata && Object.keys(l.metadata).length > 0
                  const isOpen = expanded.has(l.id)
                  const src = l.metadata?.source
                  return (
                    <React.Fragment key={l.id}>
                      <tr style={{ borderTop: i === 0 ? 'none' : '1px solid #F1F5F9', cursor: hasMeta ? 'pointer' : 'default' }}
                          onClick={() => hasMeta && toggleExpanded(l.id)}>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: '#64748B', fontSize: 12 }}>{formatWhen(l.created_at)}</td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600, color: '#0F172A' }}>{l.user_prenom || '—'}</div>
                          <div style={{ fontSize: 11, color: '#94A3B8' }}>{l.user_email}</div>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ background: a.bg, color: a.color, border: `1px solid ${a.border}`, borderRadius: 5, padding: '3px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {a.label}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, color: '#475569' }}>
                          {ENTITY_LABELS[l.entity_type] || l.entity_type || '—'}
                        </td>
                        <td style={{ ...tdStyle, color: '#334155' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>
                              {l.entity_label || '—'}
                            </span>
                            {src === 'ai' && <span style={sourceBadge}>🤖 IA</span>}
                            {src === 'duplicate' && <span style={sourceBadge}>📋 Copie</span>}
                            {hasMeta && <span style={{ fontSize: 10, color: '#94A3B8' }}>{isOpen ? '▾' : '▸'}</span>}
                          </div>
                        </td>
                      </tr>
                      {hasMeta && isOpen && (
                        <tr style={{ background: '#F8FAFC', borderTop: '1px solid #E2E8F0' }}>
                          <td colSpan={5} style={{ padding: '10px 14px' }}>
                            <pre style={metaStyle}>{JSON.stringify(l.metadata, null, 2)}</pre>
                            {l.user_agent && <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 4 }}>Appareil : {l.user_agent}</div>}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Charger plus */}
      {!loading && logs.length > 0 && hasMore && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button
            onClick={() => {
              const last = logs[logs.length - 1]
              if (last?.created_at) load({ append: true, before: last.created_at })
            }}
            disabled={loadingMore}
            style={{ ...btnS, fontSize: 12 }}
          >
            {loadingMore ? '⏳ Chargement…' : 'Charger 200 entrées de plus'}
          </button>
        </div>
      )}
    </div>
  )
}

const thStyle = { padding: '10px 14px', fontWeight: 700 }
const tdStyle = { padding: '10px 14px', verticalAlign: 'top' }
const sourceBadge = {
  display: 'inline-flex', alignItems: 'center', gap: 3,
  padding: '1px 6px', borderRadius: 4, background: '#F0FDFA',
  border: '1px solid #99F6E4', color: '#0F766E',
  fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap',
}
const metaStyle = {
  fontSize: 11, color: '#334155',
  background: '#fff', border: '1px solid #E2E8F0',
  borderRadius: 6, padding: '8px 10px', margin: 0,
  overflowX: 'auto', maxWidth: '100%',
  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
}
