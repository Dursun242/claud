'use client'

// ═══════════════════════════════════════════════════════════════
// OSFormModal — modale de création / édition d'un Ordre de Service.
// ═══════════════════════════════════════════════════════════════
//
// Présentationnel : l'état (form, prestations…) vit dans OrdresServiceV ;
// cette modale ne fait qu'afficher et appeler les setters/handlers passés
// en props. Toute la logique d'extraction photo, de calculs de totaux et
// de persistance reste dans le parent (via hooks useImportDevis et
// usePrestationManager).
//
// Props :
//   modal                   : "new" | "edit" | null
//   onClose                 : () => void
//   form, setForm           : état + setter
//   updateChantier          : (chantierId) => void
//   updateDestinataire      : (nom contact) => void
//   prestations             : Array<prestation>
//   addPrestation           : () => void
//   removePrestation        : (i) => void
//   updatePrestation        : (i, field, value) => void
//   totals                  : { ht, tva, ttc }
//   formError, setFormError : erreur validation
//   saving                  : boolean
//   handleSave              : () => Promise<void>
//   chantiers               : data.chantiers
//   contactsParType         : { type: [contacts] } groupé pour les optgroups
//   importing, importError  : état hook useImportDevis
//   devisInputRef           : ref sur <input type="file"> d'import photo
//   onImportClick           : () => void — déclenche devisInputRef.current.click()
//   m                       : boolean (mobile)
//   FF, inp, sel, btnP, btnS, Icon, I, fmtMoney : helpers partagés

import Modal from './Modal'

export default function OSFormModal({
  modal,
  onClose,
  form,
  setForm,
  updateChantier,
  updateDestinataire,
  prestations,
  addPrestation,
  removePrestation,
  updatePrestation,
  totals,
  formError,
  setFormError,
  saving,
  handleSave,
  chantiers,
  contactsParType,
  importing,
  importError,
  onImportClick,
  m,
  FF,
  inp,
  sel,
  btnP,
  btnS,
  Icon,
  I,
  fmtMoney,
}) {
  return (
    <Modal open={!!modal} onClose={onClose}
      title={modal === 'edit' ? "Modifier l'Ordre de Service" : "Nouvel Ordre de Service"}
      wide>

      {/* ── IMPORT DEVIS PAR PHOTO (visible uniquement en création) ── */}
      {modal === 'new' && (
        <div style={{
          background: '#EEF2FF', border: '1.5px solid #C7D2FE',
          borderRadius: 10, padding: '12px 14px', marginBottom: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15 }}>📸</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#4338CA' }}>Import devis par photo ou capture</span>
            <span style={{ fontSize: 10, color: '#818CF8', width: '100%' }}>
              Photo d&apos;un devis, facture, bon de commande ou screenshot PDF
            </span>
          </div>
          <button
            onClick={onImportClick}
            disabled={importing}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 8,
              border: '1.5px dashed #A5B4FC',
              background: '#fff',
              color: '#4F46E5',
              fontSize: 13,
              fontWeight: 600,
              cursor: importing ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              opacity: importing ? 0.7 : 1,
            }}
          >
            {importing ? (
              <>
                <span style={{
                  display: 'inline-block', width: 12, height: 12,
                  border: '2px solid #C7D2FE', borderTopColor: '#4F46E5',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite'
                }}/>
                Extraction en cours…
              </>
            ) : (
              <>📷 Choisir une photo ou capture</>
            )}
          </button>
          {importError && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#DC2626' }}>{importError}</div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr 1fr', gap: '0 12px' }}>
        <FF label="N° OS">
          <input style={inp} value={form.numero || ''}
            onChange={(e) => setForm({ ...form, numero: e.target.value })}/>
        </FF>
        <FF label="Chantier">
          <select style={sel} value={form.chantier_id || ''}
            onChange={(e) => updateChantier(e.target.value)}>
            {chantiers.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </FF>
        <FF label="Statut">
          <select style={sel} value={form.statut || ''}
            onChange={(e) => setForm({ ...form, statut: e.target.value })}>
            <option>Brouillon</option><option>Émis</option><option>Signé</option>
            <option>En cours</option><option>Terminé</option><option>Annulé</option>
          </select>
        </FF>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap: '0 12px' }}>
        <FF label="Client">
          {form.client_nom && (
            <div style={{ fontSize: 13, padding: '8px 0', color: '#0F172A', fontWeight: 600 }}>
              {form.client_nom}
            </div>
          )}
        </FF>
        <FF label="Destinataire">
          <select style={sel} value={form.artisan_nom || ''}
            onChange={(e) => updateDestinataire(e.target.value)}>
            <option value="">— Sélectionner —</option>
            {Object.entries(contactsParType).map(([type, contacts]) => (
              <optgroup key={type} label={type}>
                {contacts.map((c) => (
                  <option key={c.id} value={c.nom}>
                    {c.nom}{c.specialite ? ` · ${c.specialite}` : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </FF>
      </div>
      <FF label="Adresse du destinataire">
        <input style={inp} value={form.artisan_adresse || ''}
          onChange={(e) => setForm({ ...form, artisan_adresse: e.target.value })}
          placeholder="Adresse complète du prestataire"/>
      </FF>
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr 1fr', gap: '0 12px' }}>
        <FF label="Date émission">
          <input type="date" style={inp} value={form.date_emission || ''}
            onChange={(e) => setForm({ ...form, date_emission: e.target.value })}/>
        </FF>
        <FF label="Date intervention">
          <input type="date" style={inp} value={form.date_intervention || ''}
            onChange={(e) => setForm({ ...form, date_intervention: e.target.value })}/>
        </FF>
        <FF label="Date fin prévue">
          <input type="date" style={inp} value={form.date_fin_prevue || ''}
            onChange={(e) => setForm({ ...form, date_fin_prevue: e.target.value })}/>
        </FF>
      </div>

      {/* PRESTATIONS */}
      <div style={{ marginTop: 12, marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#1E3A5F', textTransform: 'uppercase' }}>Prestations</span>
          <button onClick={addPrestation} style={{
            fontSize: 11, color: '#3B82F6', background: 'none',
            border: 'none', cursor: 'pointer', fontWeight: 600
          }}>+ Ajouter une ligne</button>
        </div>
        {prestations.map((p, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: m ? '1fr' : '3fr 1fr 1fr 1fr 1fr auto',
            gap: 6, marginBottom: 6, alignItems: 'end'
          }}>
            <input placeholder="Description" style={{ ...inp, fontSize: 12 }}
              value={p.description}
              onChange={(e) => updatePrestation(i, 'description', e.target.value)}/>
            <select style={{ ...sel, fontSize: 12 }} value={p.unite}
              onChange={(e) => updatePrestation(i, 'unite', e.target.value)}>
              <option>u</option><option>m²</option><option>ml</option><option>m³</option>
              <option>kg</option><option>h</option><option>forfait</option><option>ens</option>
            </select>
            <input placeholder="Qté" type="number" style={{ ...inp, fontSize: 12 }}
              value={p.quantite}
              onChange={(e) => updatePrestation(i, 'quantite', e.target.value)}/>
            <input placeholder="PU HT €" type="number" step="0.01"
              style={{ ...inp, fontSize: 12 }} value={p.prix_unitaire}
              onChange={(e) => updatePrestation(i, 'prix_unitaire', e.target.value)}/>
            <select style={{ ...sel, fontSize: 12 }} value={p.tva_taux}
              onChange={(e) => updatePrestation(i, 'tva_taux', e.target.value)}>
              <option value="20">20%</option><option value="10">10%</option>
              <option value="5.5">5.5%</option><option value="0">0%</option>
            </select>
            <button onClick={() => removePrestation(i)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
              <Icon d={I.trash} size={14} color="#EF4444"/>
            </button>
          </div>
        ))}
      </div>

      {/* TOTAUX */}
      <div style={{
        background: '#F8FAFC', borderRadius: 8, padding: 12,
        display: 'flex', justifyContent: 'flex-end', gap: 20, marginBottom: 12
      }}>
        <div>
          <span style={{ fontSize: 11, color: '#64748B' }}>Total HT : </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{fmtMoney(totals.ht)}</span>
        </div>
        <div>
          <span style={{ fontSize: 11, color: '#64748B' }}>TVA : </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#F59E0B' }}>{fmtMoney(totals.tva)}</span>
        </div>
        <div>
          <span style={{ fontSize: 11, color: '#64748B' }}>TTC : </span>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#1E3A5F' }}>{fmtMoney(totals.ttc)}</span>
        </div>
      </div>

      <FF label="Observations">
        <textarea style={{ ...inp, minHeight: 50, resize: 'vertical' }}
          value={form.observations || ''}
          onChange={(e) => setForm({ ...form, observations: e.target.value })}/>
      </FF>
      <FF label="Conditions de paiement">
        <textarea style={{ ...inp, minHeight: 40, resize: 'vertical' }}
          value={form.conditions || ''}
          onChange={(e) => setForm({ ...form, conditions: e.target.value })}/>
      </FF>

      {formError && (
        <div style={{
          background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8,
          padding: '8px 12px', marginTop: 10, marginBottom: 4, fontSize: 12, color: '#DC2626',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 14 }}>⚠</span>
          <span style={{ flex: 1 }}>{formError}</span>
          <button onClick={() => setFormError('')} aria-label="Fermer" style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#DC2626', fontSize: 14, padding: 0, lineHeight: 1
          }}>✕</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button onClick={onClose} style={btnS}>Annuler</button>
        <button onClick={handleSave} disabled={saving}
          style={{ ...btnP, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Enregistrement…' : "Enregistrer l'OS"}
        </button>
      </div>
    </Modal>
  )
}
