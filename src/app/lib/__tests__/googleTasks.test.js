/** @jest-environment node */
// Tests pour les fonctions PURES de googleTasks.js (mapping uniquement).
// Les fonctions qui touchent à Supabase / fetch sont testées séparément.

import {
  buildNotesPrefix,
  tacheToGoogleTask,
  googleTaskToTachePatch,
} from '../googleTasks'

describe('googleTasks — mapping', () => {
  describe('buildNotesPrefix', () => {
    it('retourne vide si aucun champ n\'est fourni', () => {
      expect(buildNotesPrefix({})).toBe('')
    })

    it('formate les 3 champs en un seul bloc entre crochets', () => {
      const out = buildNotesPrefix({
        chantierLabel: 'Villa Dupont',
        priorite: 'haute',
        lot: 'Plomberie',
      })
      expect(out).toMatch(/^\[/)
      expect(out).toMatch(/\]$/)
      expect(out).toContain('Chantier: Villa Dupont')
      expect(out).toContain('Priorité: haute')
      expect(out).toContain('Lot: Plomberie')
      // Les segments sont séparés par " | "
      expect(out.split('|').length).toBe(3)
    })

    it('ignore les champs absents', () => {
      expect(buildNotesPrefix({ priorite: 'haute' })).toBe('[Priorité: haute]')
    })
  })

  describe('tacheToGoogleTask', () => {
    it('mappe titre / statut / echeance vers les champs Google', () => {
      const out = tacheToGoogleTask({
        titre: 'Carreler la salle de bain',
        statut: 'a_faire',
        echeance: '2026-06-01',
        priorite: 'haute',
        lot: null,
      }, { chantierLabel: 'Les Voiles' })

      expect(out.title).toBe('Carreler la salle de bain')
      expect(out.status).toBe('needsAction')
      expect(out.due).toBe('2026-06-01T00:00:00.000Z')
      expect(out.notes).toContain('Chantier: Les Voiles')
      expect(out.notes).toContain('Priorité: haute')
    })

    it('mappe statut "fait" vers "completed"', () => {
      const out = tacheToGoogleTask({ titre: 'X', statut: 'fait' })
      expect(out.status).toBe('completed')
    })

    it('mappe "en_cours" vers "needsAction" (Google n\'a que 2 états)', () => {
      const out = tacheToGoogleTask({ titre: 'X', statut: 'en_cours' })
      expect(out.status).toBe('needsAction')
    })

    it('met due à undefined si pas d\'échéance', () => {
      const out = tacheToGoogleTask({ titre: 'X', statut: 'a_faire' })
      expect(out.due).toBeUndefined()
    })

    it('fallback "(sans titre)" si titre vide', () => {
      const out = tacheToGoogleTask({ titre: '', statut: 'a_faire' })
      expect(out.title).toBe('(sans titre)')
    })
  })

  describe('googleTaskToTachePatch', () => {
    it('extrait titre, statut, echeance + meta de sync', () => {
      const patch = googleTaskToTachePatch({
        id: 'g123',
        etag: '"abc"',
        title: 'Acheter peinture',
        status: 'needsAction',
        due: '2026-06-15T00:00:00.000Z',
      })
      expect(patch.titre).toBe('Acheter peinture')
      expect(patch.statut).toBe('a_faire')
      expect(patch.echeance).toBe('2026-06-15')
      expect(patch.google_task_id).toBe('g123')
      expect(patch.google_etag).toBe('"abc"')
      expect(patch.synced_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('mappe "completed" → "fait"', () => {
      const patch = googleTaskToTachePatch({ id: 'g1', status: 'completed', title: 'X' })
      expect(patch.statut).toBe('fait')
    })

    it('echeance = null si due absent', () => {
      const patch = googleTaskToTachePatch({ id: 'g1', status: 'needsAction', title: 'X' })
      expect(patch.echeance).toBeNull()
    })

    it('ne dérive PAS priorite / lot / chantier_id (lecture seule côté Google)', () => {
      const patch = googleTaskToTachePatch({
        id: 'g1', status: 'needsAction', title: 'X',
        notes: '[Chantier: Villa | Priorité: haute | Lot: Plomberie]',
      })
      expect(patch).not.toHaveProperty('priorite')
      expect(patch).not.toHaveProperty('lot')
      expect(patch).not.toHaveProperty('chantier_id')
    })
  })
})
