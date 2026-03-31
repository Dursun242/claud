'use client'
import { supabase } from '../supabaseClient'

/**
 * OPTIMIZED DATA LOADING
 * Charge les données PAR SECTION, pas tout d'un coup
 *
 * Avant: loadAll() = 7 requêtes parallèles
 * Après: Charger par priorité
 */

// PRIORITY 1: Essential data (shown immediately)
export async function loadEssentialData() {
  try {
    const [contacts, users] = await Promise.all([
      supabase.from('contacts').select('*').order('nom').limit(100),
      supabase.from('authorized_users').select('*').order('prenom'),
    ])

    return {
      contacts: contacts.data || [],
      users: users.data || [],
      // Autres données = null (lazy load)
      chantiers: [],
      tasks: [],
      planning: [],
      rdv: [],
      compteRendus: [],
      ordresService: [],
    }
  } catch (err) {
    console.error('Essential data load failed:', err)
    return null
  }
}

// PRIORITY 2: Projects data (ProjectsV tab)
export async function loadProjectsData() {
  try {
    const [chantiers, tasks, planning, cr, os] = await Promise.all([
      supabase.from('chantiers').select('*').order('created_at', { ascending: false }),
      supabase.from('taches').select('*').order('created_at', { ascending: false }),
      supabase.from('planning').select('*').order('debut'),
      supabase.from('compte_rendus').select('*').order('date', { ascending: false }),
      supabase.from('ordres_service').select('*').order('created_at', { ascending: false }),
    ])

    return {
      chantiers: (chantiers.data || []).map((c) => ({ ...c, lots: c.lots || [] })),
      tasks: (tasks.data || []).map((t) => ({ ...t, chantierId: t.chantier_id })),
      planning: (planning.data || []).map((p) => ({ ...p, chantierId: p.chantier_id })),
      compteRendus: (cr.data || []).map((c) => ({ ...c, chantierId: c.chantier_id })),
      ordresService: os.data || [],
    }
  } catch (err) {
    console.error('Projects data load failed:', err)
    return null
  }
}

// PRIORITY 3: RDV data (Calendar tab)
export async function loadCalendarData() {
  try {
    const { data } = await supabase
      .from('rdv')
      .select('*')
      .order('date')
      .limit(500)

    return {
      rdv: (data || []).map((r) => ({
        ...r,
        chantierId: r.chantier_id,
        participants: r.participants || [],
      })),
    }
  } catch (err) {
    console.error('Calendar data load failed:', err)
    return null
  }
}

/**
 * USAGE PATTERN:
 *
 * // On mount: load essential only
 * const essential = await loadEssentialData()
 * setData(essential)
 *
 * // When user clicks "Projects" tab: load projects data
 * const projects = await loadProjectsData()
 * setData(prev => ({ ...prev, ...projects }))
 *
 * // When user clicks "Calendar" tab: load calendar data
 * const calendar = await loadCalendarData()
 * setData(prev => ({ ...prev, ...calendar }))
 */
