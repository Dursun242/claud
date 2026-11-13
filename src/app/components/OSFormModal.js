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
//   lotOptions              : string[] — lots du chiffrage (sinon du chantier)
//   suggestedLot            : string|null — lot probable d'après la spécialité
//   lockReason              : string|null — OS figé (signé / en signature) :
//                             seul le statut reste modifiable
//   lockChantier            : boolean — chantier imposé (fiche chantier)
//   statutOptions           : string[] — statuts proposés (lib/osRules.statutsPossibles)

import Modal from './Modal'
import AddressPicker from './AddressPicker'

export default function OSFormModal({
  modal,
  onClose,
  form,
  setForm,
  updateChantier,
  updateDestinataire,
  setTvaNonApplicable,
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
  lotOptions = [],
  suggestedLot = null,
  lockReason = null,
  lockChantier = false,
  statutOptions = ['Brouillon', 'Émis', 'Signé', 'En cours', 'Terminé', 'Annulé'],
}) {
  const tvaNA = !!form.tva_non_applicable
  const locked = !!lockReason
  const lots = form.lot && !lotOptions.includes(form.lot) ? [form.lot, ...lotOptions] : lotOptions
  // Entreprise absente de l'annuaire (import d'un devis, OS ancien) : elle
  // reste affichée dans la liste au lieu de « — Sélectionner — ».
  const knownNames = new Set(Object.values(contactsParType).flat().map(c => c.nom))
  const unknownArtisan = form.artisan_nom && !knownNames.has(form.artisan_nom) ? form.artisan_nom : null
  const statuts = form.statut && !statutOptions.includes(form.statut) ? [form.statut, ...statutOptions] : statutOptions
  return (
    <Modal open={!!modal} onClose={onClose}
      title={modal === 'edit' ? "Modifier l'Ordre de Service" : "Nouvel Ordre de Service"}
      wide>

      {locked && (
        <div role="status" style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          background: 'var(--row-fill)', border: '1px solid var(--separator)',
          borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 13, color: 'var(--label)',
        }}>
          <Icon d={I.lock} size={16} stroke={1.75} />
          <span style={{ flex: 1, lineHeight: 1.4 }}>{lockReason}</span>
        </div>
      )}

      {/* ── IMPORT DEVIS PAR PHOTO (visible uniquement en création) ── */}
      {modal === 'new' && onImportClick && (
        <div style={{
          background: 'var(--purple-tint)', border: '1.5px solid var(--purple-line)',
          borderRadius: 10, padding: '12px 14px', marginBottom: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            <Icon d={I.camera} size={16} stroke={1.5} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--purple-text)' }}>Import devis par photo ou capture</span>
            <span style={{ fontSize: 12, color: 'var(--purple-text)', width: '100%' }}>
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
              border: '1.5px dashed var(--purple-line)',
              background: '#fff',
              color: 'var(--purple-text)',
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
                  border: '2px solid var(--purple-line)', borderTopColor: 'var(--purple-text)',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite'
                }}/>
                Extraction en cours…
              </>
            ) : (
              <>Choisir une photo ou capture</>
            )}
          </button>
          {importError && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--red-text)' }}>{importError}</div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr 1fr', gap: '0 12px' }}>
        <FF label="N° OS">
          <input style={inp} value={form.numero || ''} disabled={locked}
            onChange={(e) => setForm({ ...form, numero: e.target.value })}/>
        </FF>
        <FF label="Chantier">
          <select style={sel} value={form.chantier_id || ''} disabled={locked || lockChantier}
            onChange={(e) => updateChantier(e.target.value)}>
            {!form.chantier_id && <option value="">— Choisir —</option>}
            {chantiers.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </FF>
        <FF label="Statut">
          <select style={sel} value={form.statut || 'Brouillon'}
            onChange={(e) => setForm({ ...form, statut: e.target.value })}>
            {statuts.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </FF>
      </div>
      <fieldset disabled={locked} style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap: '0 12px' }}>
        <FF label="Client">
          {form.client_nom && (
            <div style={{ fontSize: 13, padding: '8px 0', color: 'var(--label)', fontWeight: 600 }}>
              {form.client_nom}
            </div>
          )}
        </FF>
        <FF label="Destinataire">
          <select style={sel} value={form.artisan_nom || ''}
            onChange={(e) => updateDestinataire(e.target.value)}>
            <option value="">— Sélectionner —</option>
            {unknownArtisan && <option value={unknownArtisan}>{unknownArtisan} (hors annuaire)</option>}
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
      {lots.length > 0 && (
        <FF label="Lot" hint="Rattache l'OS à un lot du chiffrage estimatif : comparaison estimé / engagé dans la fiche chantier.">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select style={{ ...sel, flex: '1 1 200px' }} value={form.lot || ''}
              onChange={(e) => setForm(f => ({ ...f, lot: e.target.value }))}>
              <option value="">— Aucun —</option>
              {lots.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            {!form.lot && suggestedLot && (
              <button type="button" onClick={() => setForm(f => ({ ...f, lot: suggestedLot }))}
                style={{ ...btnS, padding: '6px 10px', fontSize: 12 }}>
                Suggestion : {suggestedLot}
              </button>
            )}
          </div>
        </FF>
      )}
      <FF label="Adresse du destinataire">
        <AddressPicker value={form.artisan_adresse || ''}
          onChange={(v) => setForm(f => ({ ...f, artisan_adresse: v }))}
          placeholder="Adresse complète du prestataire"/>
      </FF>
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr 1fr', gap: '0 12px' }}>
        <FF label="Date émission">
          <input type="date" style={inp} value={form.date_emission || ''}
            onChange={(e) => setForm({ ...form, date_emission: e.target.value })}/>
        </FF>
        <FF label="Début des travaux">
          <input type="date" style={inp} value={form.date_intervention || ''}
            onChange={(e) => setForm({ ...form, date_intervention: e.target.value })}/>
        </FF>
        <FF label="Date fin prévue">
          <input type="date" style={inp} value={form.date_fin_prevue || ''}
            onChange={(e) => setForm({ ...form, date_fin_prevue: e.target.value })}/>
        </FF>
      </div>

      {/* TVA NON APPLICABLE — auto-entrepreneur en franchise de base (art. 293 B du CGI) */}
      <label style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        background: tvaNA ? 'var(--orange-tint)' : 'var(--row-fill)',
        border: `1px solid ${tvaNA ? 'var(--orange-line)' : 'var(--separator)'}`,
        borderRadius: 8, padding: '8px 12px', marginTop: 12, marginBottom: 8,
        cursor: 'pointer', fontSize: 12,
      }}>
        <input
          type="checkbox"
          checked={tvaNA}
          onChange={(e) => setTvaNonApplicable?.(e.target.checked)}
          style={{ marginTop: 2 }}
        />
        <span style={{ flex: 1, lineHeight: 1.4 }}>
          <span style={{ fontWeight: 600, color: 'var(--label)' }}>TVA non applicable</span>
          <span style={{ color: 'var(--label-secondary)' }}> — auto-entrepreneur en franchise de base (art. 293 B du CGI)</span>
          {tvaNA && (
            <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: 'var(--orange-deep)' }}>
              Toutes les lignes seront facturées à 0 % et la mention légale apparaîtra sur le PDF.
            </span>
          )}
        </span>
      </label>

      {/* PRESTATIONS */}
      <div style={{ marginTop: 4, marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--label-secondary)'}}>Prestations</span>
          {!locked && <button onClick={addPrestation} style={{
            fontSize: 12, color: 'var(--accent-text)', background: 'none',
            border: 'none', cursor: 'pointer', fontWeight: 600
          }}>+ Ajouter une ligne</button>}
        </div>
        {prestations.map((p, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: m ? '1fr' : '3fr 1fr 1fr 1fr 1fr auto',
            gap: 6, marginBottom: 6, alignItems: 'end'
          }}>
            <input aria-label={`Prestation ${i + 1} : description`} placeholder="Description" style={{ ...inp, fontSize: 12 }}
              value={p.description}
              onChange={(e) => updatePrestation(i, 'description', e.target.value)}/>
            <select aria-label={`Prestation ${i + 1} : unité`} style={{ ...sel, fontSize: 12 }} value={p.unite}
              onChange={(e) => updatePrestation(i, 'unite', e.target.value)}>
              <option>u</option><option>m²</option><option>ml</option><option>m³</option>
              <option>kg</option><option>h</option><option>forfait</option><option>ens</option>
            </select>
            <input aria-label={`Prestation ${i + 1} : quantité`} placeholder="Qté" type="number" style={{ ...inp, fontSize: 12 }}
              value={p.quantite}
              onChange={(e) => updatePrestation(i, 'quantite', e.target.value)}/>
            <input aria-label={`Prestation ${i + 1} : prix unitaire HT`} placeholder="PU HT €" type="number" step="0.01"
              style={{ ...inp, fontSize: 12 }} value={p.prix_unitaire}
              onChange={(e) => updatePrestation(i, 'prix_unitaire', e.target.value)}/>
            <select aria-label={`Prestation ${i + 1} : taux de TVA`}
              style={{ ...sel, fontSize: 12, opacity: tvaNA ? 0.5 : 1, cursor: tvaNA ? 'not-allowed' : 'pointer' }}
              value={tvaNA ? '0' : p.tva_taux}
              disabled={tvaNA}
              title={tvaNA ? 'TVA non applicable (art. 293 B du CGI)' : undefined}
              onChange={(e) => updatePrestation(i, 'tva_taux', e.target.value)}>
              <option value="20">20%</option><option value="10">10%</option>
              <option value="5.5">5.5%</option><option value="0">0%</option>
            </select>
            <button type="button" aria-label={`Supprimer la prestation ${i + 1}`} onClick={() => removePrestation(i)}
              disabled={prestations.length <= 1}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, opacity: prestations.length <= 1 ? 0.3 : 1 }}>
              <Icon d={I.trash} size={14} color="#FF3B30"/>
            </button>
          </div>
        ))}
      </div>

      {/* TOTAUX */}
      <div style={{
        background: 'var(--row-fill)', borderRadius: 8, padding: 12,
        display: 'flex', justifyContent: 'flex-end', gap: 20, marginBottom: 12
      }}>
        <div>
          <span style={{ fontSize: 12, color: 'var(--label-secondary)' }}>Total HT : </span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--label)' }}>{fmtMoney(totals.ht)}</span>
        </div>
        <div>
          <span style={{ fontSize: 12, color: 'var(--label-secondary)' }}>TVA : </span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--orange)' }}>{fmtMoney(totals.tva)}</span>
        </div>
        <div>
          <span style={{ fontSize: 12, color: 'var(--label-secondary)' }}>TTC : </span>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--label)' }}>{fmtMoney(totals.ttc)}</span>
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
      </fieldset>

      {formError && (
        <div style={{
          background: 'var(--red-tint)', border: '1px solid var(--red-line)', borderRadius: 8,
          padding: '8px 12px', marginTop: 10, marginBottom: 4, fontSize: 12, color: 'var(--red-text)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Icon d={I.alert} size={16} stroke={1.75} />
          <span style={{ flex: 1 }}>{formError}</span>
          <button onClick={() => setFormError('')} aria-label="Fermer" style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--red-text)', fontSize: 14, padding: 0, lineHeight: 1
          }}><Icon d={I.x} size={14} stroke={1.75} /></button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button onClick={onClose} style={btnS}>Annuler</button>
        <button onClick={handleSave} disabled={saving}
          style={{ ...btnP, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Enregistrement…' : locked ? 'Enregistrer le statut' : "Enregistrer l'OS"}
        </button>
      </div>
    </Modal>
  )
}
