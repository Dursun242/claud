'use client'

// ═══════════════════════════════════════════════════════════════
// ContactFormModal — modale de création / édition d'un contact.
// ═══════════════════════════════════════════════════════════════
//
// Présentationnel : l'état (form, Pappers, import photo) vit dans le
// parent (ContactsV). Cette modale se contente d'afficher et de
// propager les événements aux setters/handlers passés en props.
//
// Sections : import photo (création uniquement), recherche Pappers
// (avec rendu des résultats entreprises + dirigeants), identité,
// coordonnées, administratif, évaluation, erreurs, boutons.

import Modal from './Modal'

export default function ContactFormModal({
  modal,
  onClose,
  form,
  setForm,
  formError,
  setFormError,
  handleSave,
  types,
  m,
  // Import photo
  importing,
  importError,
  onImportClick,
  // Pappers
  pSearch,
  setPSearch,
  pLoading,
  pResults,
  pError,
  searchPappers,
  importEntrepriseFromSearch,
  importDirigeantFromSearch,
  // Styles partagés
  FF,
  inp,
  sel,
  btnP,
  btnS,
}) {
  return (
    <Modal open={!!modal} onClose={onClose}
      title={modal === 'new' ? 'Nouveau contact' : 'Modifier le contact'}
      wide>

      {/* ── IMPORT PAR PHOTO (création uniquement) ── */}
      {modal === 'new' && (
        <div style={{
          background: '#EEF2FF', border: '1.5px solid #C7D2FE',
          borderRadius: 10, padding: '12px 14px', marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15 }}>📸</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#4338CA' }}>
              Import par photo ou capture d&apos;écran
            </span>
            <span style={{ fontSize: 10, color: '#818CF8', width: '100%' }}>
              Carte de visite, signature email, contact iOS, SMS, WhatsApp…
            </span>
          </div>
          <button
            onClick={onImportClick}
            disabled={importing}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 8,
              border: '1.5px dashed #A5B4FC', background: '#fff',
              color: '#4F46E5', fontSize: 13, fontWeight: 600,
              cursor: importing ? 'wait' : 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 8, opacity: importing ? 0.7 : 1,
            }}
          >
            {importing ? (
              <>
                <span style={{
                  display: 'inline-block', width: 12, height: 12,
                  border: '2px solid #C7D2FE', borderTopColor: '#4F46E5',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                }}/>
                Extraction en cours…
              </>
            ) : <>📷 Choisir une photo ou une capture d&apos;écran</>}
          </button>
          {importError && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#DC2626' }}>{importError}</div>
          )}
        </div>
      )}

      {/* ── RECHERCHE PAPPERS ── */}
      <div style={{
        background: '#EFF6FF', border: '1.5px solid #BFDBFE',
        borderRadius: 10, padding: '12px 14px', marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#1E40AF' }}>Recherche Pappers</span>
          <span style={{ fontSize: 10, color: '#60A5FA', width: '100%' }}>
            SIRET (14 chiffres), nom d&apos;entreprise ou nom d&apos;un dirigeant
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ ...inp, flex: 1, fontSize: 13 }}
            placeholder="SIRET, Lefèvre Électricité, Yusuf Caglayan..."
            value={pSearch}
            onChange={(e) => setPSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchPappers()}
          />
          <button
            onClick={searchPappers}
            disabled={pLoading || !pSearch.trim()}
            style={{
              ...btnP, background: '#3B82F6', padding: '8px 16px',
              fontSize: 12, opacity: pLoading || !pSearch.trim() ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {pLoading ? 'Recherche...' : 'Rechercher'}
          </button>
        </div>
        {pError && <div style={{ marginTop: 8, fontSize: 11, color: '#EF4444' }}>{pError}</div>}
        {pResults && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* ── Entreprises ── */}
            {pResults.companies?.length > 0 && (
              <div>
                <div style={{
                  fontSize: 11, color: '#64748B', fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 6,
                }}>
                  🏢 Entreprises ({pResults.companies.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {pResults.companies.map((r, i) => {
                    const siege = r.siege || {}
                    return (
                      <button key={`c-${i}`} onClick={() => importEntrepriseFromSearch(r)} disabled={pLoading}
                        style={{
                          background: '#fff', border: '1.5px solid #BFDBFE',
                          borderRadius: 8, padding: '8px 12px',
                          cursor: pLoading ? 'wait' : 'pointer', textAlign: 'left',
                          display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', gap: 8, fontFamily: 'inherit',
                          opacity: pLoading ? 0.6 : 1,
                        }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
                            {r.denomination || r.nom_entreprise}
                          </div>
                          <div style={{ fontSize: 10, color: '#64748B' }}>
                            {siege.code_postal} {siege.ville} — SIRET {r.siret}
                          </div>
                          {r.libelle_activite_principale && (
                            <div style={{ fontSize: 10, color: '#94A3B8' }}>
                              {r.libelle_activite_principale}
                            </div>
                          )}
                        </div>
                        <span style={{ fontSize: 11, color: '#3B82F6', fontWeight: 600, flexShrink: 0 }}>
                          Importer →
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Dirigeants ── */}
            {pResults.dirigeants?.length > 0 && (
              <div>
                <div style={{
                  fontSize: 11, color: '#64748B', fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 6,
                }}>
                  👤 Dirigeants ({pResults.dirigeants.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {pResults.dirigeants.flatMap((d, i) => {
                    const entreprises = d.entreprises || d.companies || (d.entreprise ? [d.entreprise] : [])
                    const dirigeantInfo = {
                      nom: d.nom || d.nom_usage,
                      prenom: d.prenom,
                      qualite: d.qualite || d.fonction,
                    }
                    const fullName = `${dirigeantInfo.prenom || ''} ${dirigeantInfo.nom || ''}`.trim()

                    if (entreprises.length === 0) return []

                    return entreprises.map((ent, j) => {
                      const siege = ent.siege || {}
                      return (
                        <button
                          key={`d-${i}-${j}`}
                          onClick={() => importDirigeantFromSearch(dirigeantInfo, ent)}
                          disabled={pLoading}
                          style={{
                            background: '#fff', border: '1.5px solid #C7D2FE',
                            borderRadius: 8, padding: '8px 12px',
                            cursor: pLoading ? 'wait' : 'pointer', textAlign: 'left',
                            display: 'flex', justifyContent: 'space-between',
                            alignItems: 'center', gap: 8,
                            fontFamily: 'inherit', opacity: pLoading ? 0.6 : 1,
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
                              {fullName}
                              {dirigeantInfo.qualite && (
                                <span style={{
                                  fontSize: 10, color: '#6366F1',
                                  fontWeight: 600, marginLeft: 6,
                                }}>({dirigeantInfo.qualite})</span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#4338CA' }}>
                              {ent.denomination || ent.nom_entreprise}
                            </div>
                            <div style={{ fontSize: 10, color: '#64748B' }}>
                              {[
                                siege.code_postal || ent.code_postal,
                                siege.ville || ent.ville,
                              ].filter(Boolean).join(' ')}
                              {ent.siret && <> — SIRET {ent.siret}</>}
                            </div>
                          </div>
                          <span style={{ fontSize: 11, color: '#6366F1', fontWeight: 600, flexShrink: 0 }}>
                            Importer →
                          </span>
                        </button>
                      )
                    })
                  })}
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* Identité */}
      <div style={{
        fontSize: 11, fontWeight: 700, color: '#1E3A5F',
        textTransform: 'uppercase', marginBottom: 8, marginTop: 4,
      }}>Identité</div>
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr 1fr', gap: '0 12px' }}>
        <FF label="Nom / Prénom *">
          <input style={inp} value={form.nom || ''}
            onChange={(e) => setForm({ ...form, nom: e.target.value })}/>
        </FF>
        <FF label="Société / Raison sociale">
          <input style={inp} value={form.societe || ''}
            onChange={(e) => setForm({ ...form, societe: e.target.value })}/>
        </FF>
        <FF label="Type">
          <select style={sel} value={form.type || ''} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </FF>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap: '0 12px' }}>
        <FF label="Spécialité / Métier">
          <input style={inp} value={form.specialite || ''}
            onChange={(e) => setForm({ ...form, specialite: e.target.value })}
            placeholder="Ex: Électricité CFO/CFA, Gros œuvre..."/>
        </FF>
        <FF label="Fonction">
          <input style={inp} value={form.fonction || ''}
            onChange={(e) => setForm({ ...form, fonction: e.target.value })}
            placeholder="Ex: Gérant, Conducteur de travaux..."/>
        </FF>
      </div>

      {/* Coordonnées */}
      <div style={{
        fontSize: 11, fontWeight: 700, color: '#1E3A5F',
        textTransform: 'uppercase', marginBottom: 8, marginTop: 12,
      }}>Coordonnées</div>
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr 1fr', gap: '0 12px' }}>
        <FF label="Tél. mobile">
          <input style={inp} value={form.tel || ''}
            onChange={(e) => setForm({ ...form, tel: e.target.value })}
            placeholder="06 ..."/>
        </FF>
        <FF label="Tél. fixe">
          <input style={inp} value={form.tel_fixe || ''}
            onChange={(e) => setForm({ ...form, tel_fixe: e.target.value })}
            placeholder="02 35 ..."/>
        </FF>
        <FF label="Email">
          <input type="email" style={inp} value={form.email || ''}
            onChange={(e) => setForm({ ...form, email: e.target.value })}/>
        </FF>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '2fr 1fr 1fr', gap: '0 12px' }}>
        <FF label="Adresse">
          <input style={inp} value={form.adresse || ''}
            onChange={(e) => setForm({ ...form, adresse: e.target.value })}/>
        </FF>
        <FF label="Code postal">
          <input style={inp} value={form.code_postal || ''}
            onChange={(e) => setForm({ ...form, code_postal: e.target.value })}/>
        </FF>
        <FF label="Ville">
          <input style={inp} value={form.ville || ''}
            onChange={(e) => setForm({ ...form, ville: e.target.value })}/>
        </FF>
      </div>
      <FF label="Site web">
        <input style={inp} value={form.site_web || ''}
          onChange={(e) => setForm({ ...form, site_web: e.target.value })}
          placeholder="https://..."/>
      </FF>

      {/* Administratif */}
      <div style={{
        fontSize: 11, fontWeight: 700, color: '#1E3A5F',
        textTransform: 'uppercase', marginBottom: 8, marginTop: 12,
      }}>Administratif</div>
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap: '0 12px' }}>
        <FF label="SIRET">
          <input style={inp} value={form.siret || ''}
            onChange={(e) => setForm({ ...form, siret: e.target.value })}
            placeholder="XXX XXX XXX XXXXX"/>
        </FF>
        <FF label="TVA intracommunautaire">
          <input style={inp} value={form.tva_intra || ''}
            onChange={(e) => setForm({ ...form, tva_intra: e.target.value })}
            placeholder="FR XX XXXXXXXXX"/>
        </FF>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap: '0 12px' }}>
        <FF label="Assurance décennale">
          <input style={inp} value={form.assurance_decennale || ''}
            onChange={(e) => setForm({ ...form, assurance_decennale: e.target.value })}
            placeholder="N° police + assureur"/>
        </FF>
        <FF label="Validité assurance">
          <input type="date" style={inp} value={form.assurance_validite || ''}
            onChange={(e) => setForm({ ...form, assurance_validite: e.target.value })}/>
        </FF>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr', gap: '0 12px' }}>
        <FF label="IBAN">
          <input style={inp} value={form.iban || ''}
            onChange={(e) => setForm({ ...form, iban: e.target.value })}
            placeholder="FR76 XXXX ..."/>
        </FF>
        <FF label="Qualifications (Qualibat, RGE...)">
          <input style={inp} value={form.qualifications || ''}
            onChange={(e) => setForm({ ...form, qualifications: e.target.value })}/>
        </FF>
      </div>

      {/* Évaluation */}
      <div style={{
        fontSize: 11, fontWeight: 700, color: '#1E3A5F',
        textTransform: 'uppercase', marginBottom: 8, marginTop: 12,
      }}>Évaluation</div>
      <div style={{ display: 'grid', gridTemplateColumns: m ? '1fr' : '1fr 1fr 1fr', gap: '0 12px' }}>
        <FF label="Note (étoiles)">
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n}
                onClick={() => setForm({ ...form, note: form.note === n ? 0 : n })}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 22,
                  color: n <= (form.note || 0) ? '#F59E0B' : '#E2E8F0',
                }}>★</button>
            ))}
          </div>
        </FF>
        <FF label="Statut">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={form.actif !== false}
              onChange={(e) => setForm({ ...form, actif: e.target.checked })}/>
            {form.actif !== false ? 'Actif' : 'Inactif'}
          </label>
        </FF>
      </div>
      <FF label="Notes / Remarques">
        <textarea style={{ ...inp, minHeight: 50, resize: 'vertical' }}
          value={form.notes || ''}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Notes internes..."/>
      </FF>

      {formError && (
        <div style={{
          background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8,
          padding: '8px 12px', marginTop: 10, marginBottom: 4, fontSize: 12, color: '#DC2626',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 14 }}>⚠</span>
          <span style={{ flex: 1 }}>{formError}</span>
          <button onClick={() => setFormError('')} aria-label="Fermer"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#DC2626', fontSize: 14, padding: 0, lineHeight: 1,
            }}>✕</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <button onClick={onClose} style={btnS}>Annuler</button>
        <button onClick={handleSave} style={btnP}>Enregistrer</button>
      </div>
    </Modal>
  )
}
