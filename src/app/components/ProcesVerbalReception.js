'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import Section from './Section'
import { EMOJI } from '../lib/emoji'
import EmptyState from './EmptyState'
import PVRow from './pv/PVRow'
import PVDetail from './pv/PVDetail'
import PVNewForm from './pv/PVNewForm'
import { isNetworkError } from '../lib/offlineStore'
import { Icon, I, btnAdd } from '../dashboards/shared'

// Container : charge la liste des PV d'un chantier et orchestre les modales
// (détail + création). La logique de rendu est déléguée aux 3 sous-composants
// (PVRow memoïsé, PVDetail, PVNewForm) — chacun dans son propre fichier.
export default function ProcesVerbalReception({ chantierId, chantier, ordresService = [], intervenants = [], clientContact, onRefresh, readOnly = false }) {
  const [pvs, setPvs] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedPv, setSelectedPv] = useState(null)
  const [showNewForm, setShowNewForm] = useState(false)
  // Échec du chargement : message dans la section (pas de toast technique)
  const [loadError, setLoadError] = useState(null)

  const loadPVs = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      // /api/pv-reception/list est protégé par verifyAuth → on doit envoyer
      // le JWT Supabase en header, sinon la route répond 401 et on affiche
      // une liste vide alors que des PV existent en base.
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/pv-reception/list?chantierId=${chantierId}`, {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setPvs(data.data || [])
    } catch (err) {
      setLoadError(isNetworkError(err)
        ? 'Pas de réseau : les PV n\'ont pas pu être chargés.'
        : 'Les PV n\'ont pas pu être chargés.')
    } finally {
      setLoading(false)
    }
  }, [chantierId])

  useEffect(() => {
    loadPVs()
  }, [loadPVs])

  return (
    <>
      <Section title="Procès-verbaux de réception" count={pvs.length} emoji={EMOJI.pv}>
        {!readOnly && <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            onClick={() => setShowNewForm(true)}
            className="u-btn"
            style={btnAdd}
          >
            <Icon d={I.plus} size={16}/>Nouveau PV
          </button>
        </div>}

        {loading ? (
          <p style={{ color: '#6E6E73', fontSize: 12 }}>Chargement…</p>
        ) : loadError ? (
          <div role="alert" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            flexWrap: 'wrap', background: '#FFF0EF', border: '1px solid #FFC9C6',
            borderRadius: 10, padding: '10px 12px', fontSize: 13, color: '#D70015',
          }}>
            <span>{loadError}</span>
            <button type="button" onClick={loadPVs} className="u-hit" style={{
              background: '#fff', border: '1px solid #FFC9C6', borderRadius: 8,
              padding: '8px 14px', minHeight: 36, fontSize: 13, fontWeight: 600,
              color: '#D70015', cursor: 'pointer', fontFamily: 'inherit',
            }}>Réessayer</button>
          </div>
        ) : pvs.length === 0 ? (
          <EmptyState
            compact
            icon="📋"
            title="Aucun PV pour ce chantier"
            description="Les procès-verbaux de réception apparaîtront ici une fois créés."
          />
        ) : (
          pvs.map((pv) => (
            <PVRow key={pv.id} pv={pv} onDetail={setSelectedPv} />
          ))
        )}
      </Section>

      {/* Détails */}
      {selectedPv && (
        <PVDetail
          pv={selectedPv}
          onClose={() => setSelectedPv(null)}
          onDecision={() => {
            loadPVs()
            onRefresh?.()
          }}
        />
      )}

      {/* Form nouveau PV */}
      {showNewForm && (
        <PVNewForm
          chantierId={chantierId}
          chantier={chantier}
          clientContact={clientContact}
          ordresService={ordresService}
          intervenants={intervenants}
          onClose={() => setShowNewForm(false)}
          onSuccess={() => {
            setShowNewForm(false)
            loadPVs()
            onRefresh?.()
          }}
        />
      )}
    </>
  )
}
