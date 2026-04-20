'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { useToast } from '../contexts/ToastContext'
import Section from './Section'
import PVRow from './pv/PVRow'
import PVDetail from './pv/PVDetail'
import PVNewForm from './pv/PVNewForm'

// Container : charge la liste des PV d'un chantier et orchestre les modales
// (détail + création). La logique de rendu est déléguée aux 3 sous-composants
// (PVRow memoïsé, PVDetail, PVNewForm) — chacun dans son propre fichier.
export default function ProcesVerbalReception({ chantierId, chantier, ordresService = [], clientContact, onRefresh }) {
  const [pvs, setPvs] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedPv, setSelectedPv] = useState(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const { addToast } = useToast()

  const loadPVs = useCallback(async () => {
    setLoading(true)
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
      console.error('Erreur chargement PV:', err)
      addToast('Erreur chargement PV: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [chantierId, addToast])

  useEffect(() => {
    loadPVs()
  }, [loadPVs])

  const PV_COLOR = '#14B8A6'

  return (
    <>
      <Section title="Procès-verbaux de réception" count={pvs.length} color={PV_COLOR}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            onClick={() => setShowNewForm(true)}
            style={{
              background: PV_COLOR, color: '#fff', border: 'none',
              borderRadius: 6, padding: '6px 12px',
              fontSize: 11, fontWeight: 700, cursor: 'pointer'
            }}
          >
            + Nouveau PV
          </button>
        </div>

        {loading ? (
          <p style={{ color: '#94A3B8', fontSize: 12 }}>Chargement…</p>
        ) : pvs.length === 0 ? (
          <p style={{ color: '#94A3B8', fontSize: 12 }}>Aucun PV pour ce chantier</p>
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
