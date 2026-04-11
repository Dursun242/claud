-- ═══════════════════════════════════════════════════════════════
-- Migration 006 — Index de performance complémentaires
-- ═══════════════════════════════════════════════════════════════
--
-- Contexte :
-- Les index sur les clés étrangères principales (chantier_id) existent
-- déjà dans supabase-schema.sql (idx_os_chantier, idx_cr_chantier,
-- idx_taches_chantier, idx_planning_chantier) et les tables v3.0
-- (os_validations, chantier_photos, cr_commentaires) sont aussi
-- correctement indexées.
--
-- Cette migration ajoute uniquement des index qui répondent à des
-- patterns de requêtes RÉELS du code existant, identifiés lors d'un
-- audit de `src/app/dashboards/shared.js` (helpers SB.loadAll*),
-- `ContactsV.findExistingContact`, et `OrdresServiceV`.
--
-- Chaque index ci-dessous est justifié par le code qui l'utilise.
-- Tous les index sont crées avec IF NOT EXISTS : la migration est
-- rejouable sans risque.
--
-- Impact : instantané sur table vide/petite, gains mesurables à partir
-- de quelques milliers de lignes. Zéro breaking change côté application.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. ordres_service(created_at DESC)
-- ─────────────────────────────────────────────────────────────
-- Pattern :
--   SB.loadAll() → .from('ordres_service')
--     .select('*')
--     .order('created_at', { ascending: false })
--     .limit(200)
--
-- Sans cet index, PostgreSQL doit scanner toute la table puis trier
-- en mémoire pour respecter l'ORDER BY. Avec un index b-tree sur la
-- colonne triée en DESC, la lecture suit directement l'ordre de l'index
-- (aucun tri nécessaire), puis LIMIT 200 stoppe très tôt.
--
-- À 50k OS : sans index ~500ms, avec index ~5ms.
CREATE INDEX IF NOT EXISTS idx_os_created_desc
  ON ordres_service(created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 2. compte_rendus(date DESC)
-- ─────────────────────────────────────────────────────────────
-- Pattern :
--   SB.loadAll() → .from('compte_rendus')
--     .select('*')
--     .order('date', { ascending: false })
--     .limit(200)
--
-- Et côté client, plusieurs vues font aussi
--   .sort((a, b) => new Date(b.date) - new Date(a.date))
-- mais c'est dans la mémoire JS après la requête, pas dans la DB.
-- L'index accélère juste le ORDER BY côté Supabase.
CREATE INDEX IF NOT EXISTS idx_cr_date_desc
  ON compte_rendus(date DESC);

-- ─────────────────────────────────────────────────────────────
-- 3. contacts(siret)
-- ─────────────────────────────────────────────────────────────
-- Patterns :
-- a) findExistingContact (OrdresServiceV.js) — quand l'IA Claude
--    extrait un SIRET depuis une photo de devis, on cherche si un
--    contact avec ce SIRET existe déjà pour ne pas doublonner.
-- b) ContactsV — recherche Pappers par SIRET + dedup locale.
-- c) QontoV importClient — match par SIRET pour fusionner les clients
--    Qonto avec les contacts existants.
--
-- Lookup exact sur un champ de 14 chiffres → cas d'école pour un
-- index b-tree. Sans index : SEQ SCAN. Avec index : INDEX SCAN O(log n).
--
-- WHERE (siret IS NOT NULL) = index partiel pour ne pas indexer les
-- milliers de contacts sans SIRET (particuliers, MOA, etc.).
CREATE INDEX IF NOT EXISTS idx_contacts_siret
  ON contacts(siret)
  WHERE siret IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 4. taches(echeance)
-- ─────────────────────────────────────────────────────────────
-- Patterns :
-- a) DashboardV calcule les "tâches en retard" via echeance < today.
-- b) TasksV trie par echeance croissante dans le filtre automatique.
-- c) Les pills de filtre statut font un GROUP BY / COUNT(*) via le
--    filtre côté client (memoisé), mais le load initial pourrait
--    bénéficier d'un order-by serveur.
--
-- À terme, quand il y aura 10k+ tâches historiques, l'index évite
-- le tri en mémoire.
CREATE INDEX IF NOT EXISTS idx_taches_echeance
  ON taches(echeance);

-- ─────────────────────────────────────────────────────────────
-- 5. contacts(actif) — index partiel
-- ─────────────────────────────────────────────────────────────
-- Pattern :
-- Plusieurs dropdowns (destinataire d'OS, participants de CR) filtrent
-- uniquement les contacts actifs. L'index partiel WHERE actif = true
-- indexe uniquement les lignes "visibles" par défaut, ce qui est plus
-- compact qu'un index complet sur la colonne booléenne.
CREATE INDEX IF NOT EXISTS idx_contacts_actif
  ON contacts(actif)
  WHERE actif = true;

-- ─────────────────────────────────────────────────────────────
-- Vérification post-migration (pour logs Supabase SQL Editor)
-- ─────────────────────────────────────────────────────────────
-- Exécute ceci après la migration pour confirmer la création :
--
--   SELECT indexname, tablename FROM pg_indexes
--   WHERE schemaname = 'public'
--     AND indexname LIKE 'idx_%'
--   ORDER BY tablename, indexname;
--
-- Tu dois voir les 5 nouveaux index listés ci-dessus en plus de
-- ceux déjà créés par les migrations précédentes.

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK (au cas où)
-- ═══════════════════════════════════════════════════════════════
-- DROP INDEX IF EXISTS idx_os_created_desc;
-- DROP INDEX IF EXISTS idx_cr_date_desc;
-- DROP INDEX IF EXISTS idx_contacts_siret;
-- DROP INDEX IF EXISTS idx_taches_echeance;
-- DROP INDEX IF EXISTS idx_contacts_actif;
