// ═══════════════════════════════════════════════════════════════
// Spéc : règles de résolution client_user_id (cf. migration 019)
// ═══════════════════════════════════════════════════════════════
//
// La résolution se passe dans la DB (fonction SQL
// `public.resolve_client_user_id()` + trigger `trg_chantiers_fill_client_user_id`).
// Ces tests documentent la LOGIQUE attendue sous forme exécutable JS, pour
// qu'on puisse la comparer côte-à-côte avec la fonction Postgres si jamais
// on en refait une variante côté serveur Node.
//
// Ils NE S'EXÉCUTENT PAS contre une vraie base — c'est volontaire : on
// valide les règles de matching pur (substring prénom, ambiguïté = NULL)
// sur une structure de données en mémoire.

/**
 * Implémentation JS miroir de la fonction Postgres
 * `public.resolve_client_user_id(text)`. Doit rester synchronisée avec
 * migrations/019_client_user_id.sql — si tu modifies l'une, modifie l'autre.
 */
function resolveClientUserId(clientText, authorizedUsers) {
  if (!clientText || !clientText.trim()) return null
  const lower = clientText.toLowerCase()

  const matches = (authorizedUsers || []).filter((u) => {
    if (!u) return false
    if (!u.actif) return false
    if (u.role !== 'client') return false
    if (!u.prenom) return false
    return lower.includes(u.prenom.toLowerCase())
  })

  if (matches.length === 1) return matches[0].user_id
  return null // 0 ou >1 → NULL par sécurité
}

describe('resolveClientUserId (miroir JS de la fonction SQL)', () => {
  const ALICE = { user_id: 'uid-alice', prenom: 'Alice', role: 'client', actif: true }
  const JEAN  = { user_id: 'uid-jean',  prenom: 'Jean',  role: 'client', actif: true }
  const JEAN2 = { user_id: 'uid-jean2', prenom: 'Jean',  role: 'client', actif: true }
  const JEANLUC = { user_id: 'uid-jeanluc', prenom: 'Jean-Luc', role: 'client', actif: true }
  const ADMIN = { user_id: 'uid-admin', prenom: 'Alice', role: 'admin',  actif: true }
  const INACTIF = { user_id: 'uid-x', prenom: 'Alice', role: 'client', actif: false }

  it('retourne null si texte client vide', () => {
    expect(resolveClientUserId('', [ALICE])).toBeNull()
    expect(resolveClientUserId(null, [ALICE])).toBeNull()
    expect(resolveClientUserId('   ', [ALICE])).toBeNull()
  })

  it('retourne null si aucun user ne matche', () => {
    expect(resolveClientUserId('Bob Martin', [ALICE, JEAN])).toBeNull()
  })

  it('retourne le uid si UN SEUL client matche', () => {
    expect(resolveClientUserId('Alice Durand', [ALICE, JEAN])).toBe('uid-alice')
  })

  it('matche en insensible à la casse', () => {
    expect(resolveClientUserId('ALICE DURAND', [ALICE])).toBe('uid-alice')
    expect(resolveClientUserId('alice durand', [ALICE])).toBe('uid-alice')
  })

  it('matche sur une sous-chaîne (pas besoin du nom exact)', () => {
    expect(resolveClientUserId('DURAND Alice', [ALICE])).toBe('uid-alice')
  })

  it('retourne null si DEUX clients homonymes matchent (cas sensible)', () => {
    // C'est précisément le bug que la migration corrige : 2 "Jean" → pas
    // d'assignation automatique, fallback prénom en RLS.
    expect(resolveClientUserId('Jean Dupont', [JEAN, JEAN2])).toBeNull()
  })

  it('ignore les utilisateurs admin/salarié même si leur prénom matche', () => {
    // Seuls les users rôle=client doivent être candidats au matching.
    expect(resolveClientUserId('Alice Durand', [ADMIN])).toBeNull()
  })

  it('ignore les utilisateurs inactifs', () => {
    expect(resolveClientUserId('Alice Durand', [INACTIF])).toBeNull()
  })

  it('préfère un match non ambigu à un match potentiellement préfixe — mais reste ambigu si les DEUX matchent', () => {
    // "Jean-Luc Durand" contient "Jean" ET "Jean-Luc" → ambigu → null.
    // C'est conservateur : si un jour on veut désambiguïser par longueur
    // de match, il faudra mettre à jour la fonction SQL ET ce test.
    expect(resolveClientUserId('Jean-Luc Durand', [JEAN, JEANLUC])).toBeNull()
  })

  it('retourne le uid si le prénom long matche seul (un seul candidat possible)', () => {
    expect(resolveClientUserId('Jean-Luc Durand', [JEANLUC])).toBe('uid-jeanluc')
  })

  it('gère une liste vide d autorisés', () => {
    expect(resolveClientUserId('Alice', [])).toBeNull()
    expect(resolveClientUserId('Alice', null)).toBeNull()
  })

  it('gère un client avec prénom null (ne matche rien)', () => {
    const sansPrenom = { user_id: 'x', prenom: null, role: 'client', actif: true }
    expect(resolveClientUserId('Alice', [sansPrenom])).toBeNull()
  })
})
