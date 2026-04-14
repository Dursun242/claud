-- ══════════════════════════════════════════════════════════════
-- MIGRATION 014 — Compte démo MOA + mode démo ouvert Google
-- ══════════════════════════════════════════════════════════════
-- Objectif : permettre à n'importe quel prospect de tester l'espace client
-- via son propre compte Google, avec un chantier fictif complet.
--
-- Deux éléments créés :
--   1. Setting demo_mode : toggle ON/OFF pilotable depuis l'Admin.
--      - OFF : seuls les emails présents dans authorized_users peuvent se
--        connecter (comportement actuel).
--      - ON : tout compte Google inconnu qui se connecte est auto-ajouté
--        en tant que client "DémoMOA" + atterrit sur le chantier démo.
--
--   2. Données démo (chantier "Villa Moreau" + OS + CR + tâches + contacts)
--      avec client = 'DémoMOA' pour matching RLS.
--
-- Côté app :
--   - /api/admin/demo-mode (GET/POST) pour piloter le toggle
--   - /api/admin/reset-demo-data (POST) pour recréer les données à neuf
--   - /api/admin/users GET détecte les inconnus et les auto-inscrit si ON
--
-- Action manuelle côté Dursun :
--   - Créer le compte Google partagé (ex: demo.idmaitrise@gmail.com) dans
--     Supabase → Authentication → Users → Add user, pour le cas où un
--     prospect n'a pas de compte Google à fournir.
-- ══════════════════════════════════════════════════════════════

BEGIN;

-- ─── Table settings : toggle mode démo ─────────────────────────────
INSERT INTO settings (key, value)
VALUES ('demo_mode', 'off')
ON CONFLICT (key) DO NOTHING;

-- ─── Compte MOA démo pré-enregistré (pour le mot de passe partagé) ──
-- Note : le user auth.users doit être créé manuellement côté Dashboard
-- Supabase. Cette entrée-ci n'est que le profil "autorisation".
INSERT INTO authorized_users (email, prenom, nom, role, actif)
VALUES ('demo-moa@id-maitrise.com', 'DémoMOA', 'Prospect', 'client', true)
ON CONFLICT (email) DO UPDATE
  SET prenom = EXCLUDED.prenom,
      nom = EXCLUDED.nom,
      role = EXCLUDED.role,
      actif = EXCLUDED.actif;

-- ─── Fonction de (re)seed du chantier démo ─────────────────────────
-- Appelée par /api/admin/reset-demo-data pour repartir sur une base propre
-- entre deux rendez-vous prospects.
CREATE OR REPLACE FUNCTION public.seed_demo_data() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_chantier_id UUID := '11111111-1111-4111-8111-111111111d01';
BEGIN
  -- 0. Purge préalable (idempotent)
  DELETE FROM ordres_service WHERE chantier_id = v_chantier_id;
  DELETE FROM compte_rendus  WHERE chantier_id = v_chantier_id;
  DELETE FROM taches         WHERE chantier_id = v_chantier_id;
  DELETE FROM chantiers      WHERE id          = v_chantier_id;
  -- On désactive temporairement les triggers de notification pour ne pas
  -- polluer le panneau Activité pendant le reseed (beaucoup d'INSERT)
  ALTER TABLE chantiers      DISABLE TRIGGER chantiers_notify_after_insert;
  ALTER TABLE taches         DISABLE TRIGGER taches_notify_after_insert;
  ALTER TABLE compte_rendus  DISABLE TRIGGER compte_rendus_notify_after_insert;
  ALTER TABLE ordres_service DISABLE TRIGGER ordres_service_notify_after_insert;

  -- 1. Chantier
  INSERT INTO chantiers (id, nom, client, adresse, phase, statut, budget, depenses, date_debut, date_fin, lots)
  VALUES (
    v_chantier_id,
    'Villa Moreau — Rénovation complète',
    'DémoMOA',
    '152 rue Jean Jaurès, 76600 Le Havre',
    'Gros œuvre',
    'En cours',
    420000, 0,
    '2026-01-15', '2026-09-30',
    ARRAY['Maçonnerie', 'Charpente', 'Couverture', 'Plomberie', 'Électricité', 'Peinture', 'Menuiserie', 'Carrelage']
  );

  -- 2. Ordres de Service
  INSERT INTO ordres_service (numero, chantier_id, artisan_nom, artisan_specialite, artisan_email, artisan_tel, date_emission, date_intervention, montant_ht, montant_tva, montant_ttc, statut, statut_signature, prestations, client_nom)
  VALUES
    ('DEMO-OS-001', v_chantier_id, 'Lefèvre Électricité', 'Électricité', 'lefevre.elec@mail.fr', '06 12 34 56 78',
     '2026-02-10', '2026-03-15', 18500, 3700, 22200, 'Signé', 'Signé',
     '[{"description":"Remise aux normes installation électrique RDC+Étage","unite":"forfait","quantite":1,"prix_unitaire":18500,"tva_taux":20}]'::jsonb,
     'Famille Moreau'),
    ('DEMO-OS-002', v_chantier_id, 'Costa Plomberie', 'Plomberie', 'costa.plomb@mail.fr', '06 23 45 67 89',
     '2026-03-05', '2026-04-01', 12800, 2560, 15360, 'Émis', 'Envoyé',
     '[{"description":"Installation sanitaires salle de bain + cuisine","unite":"forfait","quantite":1,"prix_unitaire":12800,"tva_taux":20}]'::jsonb,
     'Famille Moreau'),
    ('DEMO-OS-003', v_chantier_id, 'Normandie Peinture', 'Peinture', 'norm.peinture@mail.fr', NULL,
     '2026-03-20', NULL, 6400, 1280, 7680, 'Brouillon', 'Non envoyé',
     '[{"description":"Ravalement façade principale et courtine","unite":"m²","quantite":125,"prix_unitaire":51.2,"tva_taux":20}]'::jsonb,
     'Famille Moreau');

  -- 3. Comptes Rendus
  INSERT INTO compte_rendus (chantier_id, date, numero, resume, participants, decisions)
  VALUES
    (v_chantier_id, '2026-02-05', 1,
     'Visite de démarrage. État des lieux global satisfaisant. Pas de pathologie structure détectée. Plannings confirmés.',
     'Dursun (MOE), Famille Moreau (MOA), Lefèvre, Costa',
     'Démarrage lot gros œuvre la semaine du 10/02. Mise en sécurité du site validée.'),
    (v_chantier_id, '2026-03-12', 2,
     'Point mensuel. Lot gros œuvre en avance de 5 jours. Début lot électricité ok. Plomberie : OS validé, signature en cours.',
     'Dursun (MOE), Famille Moreau (MOA), Costa, Lefèvre',
     'Validation teinte peinture façade (RAL 9010). Point suivant : 09/04/2026.');

  -- 4. Tâches
  INSERT INTO taches (chantier_id, titre, priorite, statut, echeance, lot)
  VALUES
    (v_chantier_id, 'Choisir les carrelages salle de bain', 'Normale', 'En attente', '2026-04-20', 'Carrelage'),
    (v_chantier_id, 'Valider la couleur de façade avec l''ABF',  'Urgent',  'En attente', '2026-04-12', 'Peinture'),
    (v_chantier_id, 'Signer l''OS plomberie (Costa)',            'Urgent',  'Planifié',   '2026-03-25', 'Plomberie'),
    (v_chantier_id, 'Visite de réception lot électricité',       'Normale', 'Terminé',    '2026-03-18', 'Électricité');

  -- Réactive les triggers
  ALTER TABLE chantiers      ENABLE TRIGGER chantiers_notify_after_insert;
  ALTER TABLE taches         ENABLE TRIGGER taches_notify_after_insert;
  ALTER TABLE compte_rendus  ENABLE TRIGGER compte_rendus_notify_after_insert;
  ALTER TABLE ordres_service ENABLE TRIGGER ordres_service_notify_after_insert;
END;
$$;

-- ─── Première exécution du seed ────────────────────────────────────
SELECT public.seed_demo_data();

COMMIT;
