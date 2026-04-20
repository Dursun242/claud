// ═══════════════════════════════════════════════════════════════
// Spéc : auto-promotion du statut OS après signature Odoo complète
// ═══════════════════════════════════════════════════════════════
//
// Ces tests documentent la règle côté route /api/odoo/sync-signatures :
// quand Odoo retourne que la demande de signature est entièrement signée,
// l'OS doit basculer en statut "Signé" — mais SEULEMENT depuis les
// statuts amont (Brouillon, Émis). Les OS dont le cycle de vie a déjà
// avancé (En cours, Terminé, Annulé) ne doivent pas régresser.

const AUTO_PROMOTABLE = ['Brouillon', 'Émis']

/**
 * Miroir JS pur de la logique dans /api/odoo/sync-signatures/route.js.
 * Doit rester synchronisé avec la route — si tu modifies la règle, modifie
 * les deux endroits.
 * @returns {{ patch: object, promoted: null | {from,to} }}
 */
function computeSyncPatch({ osStatut, osStatutSignature, odooStatutSignature }) {
  if (odooStatutSignature === osStatutSignature) {
    return { patch: null, promoted: null }
  }

  const patch = { statut_signature: odooStatutSignature }
  let promoted = null

  if (odooStatutSignature === 'Signé' && AUTO_PROMOTABLE.includes(osStatut)) {
    patch.statut = 'Signé'
    promoted = { from: osStatut, to: 'Signé' }
  }

  return { patch, promoted }
}

describe('sync-signatures — auto-promotion du statut OS', () => {
  it('skip quand le statut signature est identique (rien à faire)', () => {
    const r = computeSyncPatch({
      osStatut: 'Émis', osStatutSignature: 'Signé', odooStatutSignature: 'Signé',
    })
    expect(r.patch).toBeNull()
  })

  it('Brouillon + Odoo Signé → patch statut=Signé (promotion)', () => {
    const r = computeSyncPatch({
      osStatut: 'Brouillon', osStatutSignature: 'Envoyé', odooStatutSignature: 'Signé',
    })
    expect(r.patch).toEqual({ statut_signature: 'Signé', statut: 'Signé' })
    expect(r.promoted).toEqual({ from: 'Brouillon', to: 'Signé' })
  })

  it('Émis + Odoo Signé → patch statut=Signé (promotion)', () => {
    const r = computeSyncPatch({
      osStatut: 'Émis', osStatutSignature: 'Envoyé', odooStatutSignature: 'Signé',
    })
    expect(r.patch.statut).toBe('Signé')
    expect(r.promoted.from).toBe('Émis')
  })

  it('En cours + Odoo Signé → NE touche PAS au statut principal', () => {
    const r = computeSyncPatch({
      osStatut: 'En cours', osStatutSignature: 'Envoyé', odooStatutSignature: 'Signé',
    })
    expect(r.patch).toEqual({ statut_signature: 'Signé' })
    expect(r.patch.statut).toBeUndefined()
    expect(r.promoted).toBeNull()
  })

  it('Terminé + Odoo Signé → ne rétrograde pas vers Signé', () => {
    const r = computeSyncPatch({
      osStatut: 'Terminé', osStatutSignature: 'Envoyé', odooStatutSignature: 'Signé',
    })
    expect(r.patch.statut).toBeUndefined()
    expect(r.promoted).toBeNull()
  })

  it('Annulé + Odoo Signé → ne réactive pas un OS annulé', () => {
    const r = computeSyncPatch({
      osStatut: 'Annulé', osStatutSignature: 'Envoyé', odooStatutSignature: 'Signé',
    })
    expect(r.patch.statut).toBeUndefined()
  })

  it('Brouillon + Odoo Partiellement signé → MAJ statut_signature uniquement', () => {
    const r = computeSyncPatch({
      osStatut: 'Brouillon', osStatutSignature: 'Envoyé', odooStatutSignature: 'Partiellement signé',
    })
    expect(r.patch).toEqual({ statut_signature: 'Partiellement signé' })
    expect(r.patch.statut).toBeUndefined()
  })

  it('Émis + Odoo Refusé → MAJ statut_signature, pas de promotion', () => {
    const r = computeSyncPatch({
      osStatut: 'Émis', osStatutSignature: 'Envoyé', odooStatutSignature: 'Refusé',
    })
    expect(r.patch).toEqual({ statut_signature: 'Refusé' })
    expect(r.promoted).toBeNull()
  })

  it('Émis + Odoo Expiré → MAJ statut_signature, pas de promotion', () => {
    const r = computeSyncPatch({
      osStatut: 'Émis', osStatutSignature: 'Envoyé', odooStatutSignature: 'Expiré',
    })
    expect(r.patch.statut).toBeUndefined()
  })
})
