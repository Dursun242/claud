-- ══════════════════════════════════════════════════════════════
-- MIGRATION 016 — Flag is_demo pour isoler les chantiers de démo
-- ══════════════════════════════════════════════════════════════
-- Objectif : les chantiers démo (Villa Moreau, Maison Petit, Pharmacie
-- Normandie) polluaient les listes des admins/salariés. On ajoute un
-- flag is_demo sur chantiers + filtrage côté JS pour les non-DémoMOA.
--
-- Le MOA démo continue de voir ses chantiers normalement (via
-- client_has_chantier qui match sur le prénom).
-- ══════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;

-- Marque les 3 chantiers démo existants
UPDATE chantiers SET is_demo = true
WHERE id IN (
  '11111111-1111-4111-8111-111111111d01',
  '22222222-2222-4222-8222-222222222d02',
  '33333333-3333-4333-8333-333333333d03'
);

CREATE INDEX IF NOT EXISTS idx_chantiers_is_demo ON chantiers(is_demo);

-- Mise à jour de seed_demo_data pour flagger les chantiers à la création
CREATE OR REPLACE FUNCTION public.seed_demo_data() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ch1 UUID := '11111111-1111-4111-8111-111111111d01';
  v_ch2 UUID := '22222222-2222-4222-8222-222222222d02';
  v_ch3 UUID := '33333333-3333-4333-8333-333333333d03';
BEGIN
  DELETE FROM ordres_service WHERE chantier_id IN (v_ch1, v_ch2, v_ch3);
  DELETE FROM compte_rendus  WHERE chantier_id IN (v_ch1, v_ch2, v_ch3);
  DELETE FROM taches         WHERE chantier_id IN (v_ch1, v_ch2, v_ch3);
  DELETE FROM chantiers      WHERE id          IN (v_ch1, v_ch2, v_ch3);

  ALTER TABLE chantiers      DISABLE TRIGGER chantiers_notify_after_insert;
  ALTER TABLE taches         DISABLE TRIGGER taches_notify_after_insert;
  ALTER TABLE compte_rendus  DISABLE TRIGGER compte_rendus_notify_after_insert;
  ALTER TABLE ordres_service DISABLE TRIGGER ordres_service_notify_after_insert;

  -- Villa Moreau
  INSERT INTO chantiers (id, nom, client, adresse, phase, statut, budget, depenses, date_debut, date_fin, lots, is_demo)
  VALUES (v_ch1, 'Villa Moreau — Rénovation complète', 'DémoMOA',
    '152 rue Jean Jaurès, 76600 Le Havre', 'Gros œuvre', 'En cours', 420000, 0, '2026-01-15', '2026-09-30',
    ARRAY['Maçonnerie','Charpente','Couverture','Plomberie','Électricité','Peinture','Menuiserie','Carrelage'], true);

  INSERT INTO ordres_service (numero, chantier_id, artisan_nom, artisan_specialite, artisan_email, artisan_tel, date_emission, date_intervention, montant_ht, montant_tva, montant_ttc, statut, statut_signature, prestations, client_nom) VALUES
    ('DEMO-REN-001', v_ch1, 'Lefèvre Électricité', 'Électricité', 'lefevre.elec@demo.fr', '06 12 34 56 78',
     '2026-02-10', '2026-03-15', 18500, 3700, 22200, 'Signé', 'Signé',
     '[{"description":"Remise aux normes électrique RDC+Étage","unite":"forfait","quantite":1,"prix_unitaire":18500,"tva_taux":20}]'::jsonb, 'Famille Moreau'),
    ('DEMO-REN-002', v_ch1, 'Costa Plomberie', 'Plomberie', 'costa.plomb@demo.fr', '06 23 45 67 89',
     '2026-03-05', '2026-04-01', 12800, 2560, 15360, 'Émis', 'Envoyé',
     '[{"description":"Installation sanitaires SdB + cuisine","unite":"forfait","quantite":1,"prix_unitaire":12800,"tva_taux":20}]'::jsonb, 'Famille Moreau'),
    ('DEMO-REN-003', v_ch1, 'Normandie Peinture', 'Peinture', 'norm.peinture@demo.fr', NULL,
     '2026-03-20', NULL, 6400, 1280, 7680, 'Brouillon', 'Non envoyé',
     '[{"description":"Ravalement façade principale et courtine","unite":"m²","quantite":125,"prix_unitaire":51.2,"tva_taux":20}]'::jsonb, 'Famille Moreau'),
    ('DEMO-REN-004', v_ch1, 'Atelier Bois Normand', 'Menuiserie', 'atelierbois@demo.fr', '06 56 78 90 12',
     '2026-02-28', '2026-04-10', 14200, 2840, 17040, 'Signé', 'Signé',
     '[{"description":"Fourniture et pose 8 fenêtres bois double vitrage","unite":"u","quantite":8,"prix_unitaire":1775,"tva_taux":20}]'::jsonb, 'Famille Moreau');

  INSERT INTO compte_rendus (chantier_id, date, numero, resume, participants, decisions) VALUES
    (v_ch1, '2026-02-05', 1, 'Visite de démarrage. État des lieux global satisfaisant. Pas de pathologie structure détectée. Plannings confirmés.',
     'Dursun (MOE), Famille Moreau (MOA), Lefèvre, Costa', 'Démarrage lot gros œuvre la semaine du 10/02. Mise en sécurité du site validée.'),
    (v_ch1, '2026-03-12', 2, 'Point mensuel. Lot gros œuvre en avance de 5 jours. Début électricité ok. Plomberie : OS validé, signature en cours.',
     'Dursun (MOE), Famille Moreau (MOA), Costa, Lefèvre', 'Validation teinte peinture façade (RAL 9010). Point suivant : 09/04/2026.');

  INSERT INTO taches (chantier_id, titre, priorite, statut, echeance, lot) VALUES
    (v_ch1, 'Choisir les carrelages salle de bain',        'Normale', 'En attente', '2026-04-20', 'Carrelage'),
    (v_ch1, 'Valider la couleur de façade avec l''ABF',     'Urgent',  'En attente', '2026-04-12', 'Peinture'),
    (v_ch1, 'Signer l''OS plomberie (Costa)',               'Urgent',  'Planifié',   '2026-03-25', 'Plomberie'),
    (v_ch1, 'Visite de réception lot électricité',          'Normale', 'Terminé',    '2026-03-18', 'Électricité');

  -- Maison Petit
  INSERT INTO chantiers (id, nom, client, adresse, phase, statut, budget, depenses, date_debut, date_fin, lots, is_demo)
  VALUES (v_ch2, 'Maison Petit — Construction neuve 120 m²', 'DémoMOA',
    'Lot n°14, Chemin des Falaises, 76310 Sainte-Adresse', 'Études', 'Planifié', 200000, 0, '2026-05-01', '2027-03-31',
    ARRAY['Terrassement','VRD','Gros œuvre','Charpente','Couverture','Menuiseries','Isolation','Électricité','Plomberie','Peinture','Carrelage'], true);

  INSERT INTO ordres_service (numero, chantier_id, artisan_nom, artisan_specialite, artisan_email, artisan_tel, date_emission, date_intervention, montant_ht, montant_tva, montant_ttc, statut, statut_signature, prestations, client_nom) VALUES
    ('DEMO-NEUF-001', v_ch2, 'EuroTP', 'Terrassement / VRD', 'contact@eurotp-demo.fr', '02 35 55 12 34',
     '2026-04-15', '2026-05-05', 15400, 3080, 18480, 'Signé', 'Signé',
     '[{"description":"Terrassement général + évacuation terres","unite":"m³","quantite":180,"prix_unitaire":85,"tva_taux":20},{"description":"Raccordement réseaux","unite":"forfait","quantite":1,"prix_unitaire":100,"tva_taux":20}]'::jsonb, 'Famille Petit'),
    ('DEMO-NEUF-002', v_ch2, 'Duval Maçonnerie', 'Gros œuvre', 'contact@duval-demo.fr', '06 70 11 22 33',
     '2026-04-20', '2026-06-15', 43400, 8680, 52080, 'Émis', 'Envoyé',
     '[{"description":"Fondations + dallage + murs parpaings R+1","unite":"m²","quantite":120,"prix_unitaire":361.7,"tva_taux":20}]'::jsonb, 'Famille Petit'),
    ('DEMO-NEUF-003', v_ch2, 'Bouchard Charpente', 'Charpente / Ossature', 'bouchard@demo.fr', '06 80 91 02 13',
     '2026-04-22', '2026-08-10', 19000, 3800, 22800, 'Émis', 'Envoyé',
     '[{"description":"Charpente traditionnelle bois","unite":"m²","quantite":145,"prix_unitaire":131,"tva_taux":20}]'::jsonb, 'Famille Petit'),
    ('DEMO-NEUF-004', v_ch2, 'Leroy Toiture', 'Couverture', 'leroy.toiture@demo.fr', NULL,
     '2026-05-12', NULL, 13667, 2733, 16400, 'Brouillon', 'Non envoyé',
     '[{"description":"Couverture ardoises naturelles 145 m²","unite":"m²","quantite":145,"prix_unitaire":94.3,"tva_taux":20}]'::jsonb, 'Famille Petit'),
    ('DEMO-NEUF-005', v_ch2, 'K-Line Pro', 'Menuiseries alu', 'kline@demo.fr', '06 45 56 67 78',
     '2026-05-15', '2026-10-05', 11833, 2367, 14200, 'Brouillon', 'Non envoyé',
     '[{"description":"12 menuiseries alu double vitrage + volets roulants","unite":"u","quantite":12,"prix_unitaire":985.8,"tva_taux":20}]'::jsonb, 'Famille Petit'),
    ('DEMO-NEUF-006', v_ch2, 'Isolia Normandie', 'Isolation', 'isolia@demo.fr', NULL,
     '2026-05-20', NULL, 9500, 1900, 11400, 'Brouillon', 'Non envoyé',
     '[{"description":"Isolation combles + murs ITE","unite":"m²","quantite":145,"prix_unitaire":65.5,"tva_taux":20}]'::jsonb, 'Famille Petit');

  INSERT INTO compte_rendus (chantier_id, date, numero, resume, participants, decisions) VALUES
    (v_ch2, '2026-04-02', 1, 'Réunion de kick-off. Validation permis de construire (purgé des recours). Plannings prévisionnels acceptés par MOA. Budget consolidé à 200 k€.',
     'Dursun (MOE), Famille Petit (MOA), Notaire (visio)', 'Démarrage terrassement confirmé semaine du 05/05/2026. Validation esthétique enduit ton pierre (RAL 1015).');

  INSERT INTO taches (chantier_id, titre, priorite, statut, echeance, lot) VALUES
    (v_ch2, 'Déposer le DCE auprès des consultés',    'Normale', 'Terminé',    '2026-03-10', 'DCE'),
    (v_ch2, 'Choisir les carrelages et sanitaires',   'Normale', 'En attente', '2026-06-15', 'Revêtements'),
    (v_ch2, 'RDV notaire — signature acte terrain',   'Urgent',  'Terminé',    '2026-03-28', 'Administratif'),
    (v_ch2, 'Programmer la réunion de chantier N°2',  'Normale', 'Planifié',   '2026-05-20', 'Coordination'),
    (v_ch2, 'Déclaration d''ouverture de chantier (mairie)', 'Urgent', 'Planifié', '2026-04-25', 'Administratif');

  -- Pharmacie Normandie
  INSERT INTO chantiers (id, nom, client, adresse, phase, statut, budget, depenses, date_debut, date_fin, lots, is_demo)
  VALUES (v_ch3, 'Pharmacie Normandie — Aménagement commerce 500 m²', 'DémoMOA',
    '42 avenue René Coty, 76600 Le Havre', 'Technique', 'En cours', 380000, 0, '2026-02-01', '2026-06-15',
    ARRAY['Démolition','Cloisons','Faux-plafonds','Électricité CFO/CFA','CVC / Climatisation','Plomberie','Revêtements sols','Peinture','Enseigne','Mobilier'], true);

  INSERT INTO ordres_service (numero, chantier_id, artisan_nom, artisan_specialite, artisan_email, artisan_tel, date_emission, date_intervention, montant_ht, montant_tva, montant_ttc, statut, statut_signature, prestations, client_nom) VALUES
    ('DEMO-COM-001', v_ch3, 'DemoPro', 'Démolition / Curage', 'demopro@demo.fr', '02 35 42 15 67',
     '2026-01-25', '2026-02-03', 10667, 2133, 12800, 'Signé', 'Signé',
     '[{"description":"Curage complet local 500 m² + évacuation gravats","unite":"m²","quantite":500,"prix_unitaire":21.3,"tva_taux":20}]'::jsonb, 'SARL Pharmacie Normandie'),
    ('DEMO-COM-002', v_ch3, 'Placo Expert', 'Cloisons / Faux-plafonds', 'placo.expert@demo.fr', '06 34 56 78 12',
     '2026-02-05', '2026-02-20', 23667, 4733, 28400, 'Signé', 'Signé',
     '[{"description":"Cloisons BA13 80 ml + faux-plafond dalles 500 m²","unite":"forfait","quantite":1,"prix_unitaire":23667,"tva_taux":20}]'::jsonb, 'SARL Pharmacie Normandie'),
    ('DEMO-COM-003', v_ch3, 'Lefèvre Électricité', 'Électricité CFO/CFA', 'lefevre.elec@demo.fr', '06 12 34 56 78',
     '2026-02-15', '2026-03-10', 38500, 7700, 46200, 'Émis', 'Envoyé',
     '[{"description":"Distribution élec + éclairage LED + prises","unite":"forfait","quantite":1,"prix_unitaire":28000,"tva_taux":20},{"description":"Courants faibles (VDI, alarme, vidéo)","unite":"forfait","quantite":1,"prix_unitaire":10500,"tva_taux":20}]'::jsonb, 'SARL Pharmacie Normandie'),
    ('DEMO-COM-004', v_ch3, 'Climatis Normandie', 'CVC / Climatisation', 'climatis@demo.fr', '06 78 12 34 56',
     '2026-02-28', '2026-04-05', 28750, 5750, 34500, 'Émis', 'Partiellement signé',
     '[{"description":"Centrale VRV multi-zones + VMC double flux","unite":"forfait","quantite":1,"prix_unitaire":28750,"tva_taux":20}]'::jsonb, 'SARL Pharmacie Normandie'),
    ('DEMO-COM-005', v_ch3, 'Solsol Pro', 'Revêtements sols', 'solsol@demo.fr', NULL,
     '2026-03-15', NULL, 18333, 3667, 22000, 'Brouillon', 'Non envoyé',
     '[{"description":"PVC U4P3 pharmacie 500 m² avec plinthes","unite":"m²","quantite":500,"prix_unitaire":36.7,"tva_taux":20}]'::jsonb, 'SARL Pharmacie Normandie'),
    ('DEMO-COM-006', v_ch3, 'Pub Normandie', 'Enseignes / Signalétique', 'pub.normandie@demo.fr', NULL,
     '2026-03-25', NULL, 7083, 1417, 8500, 'Brouillon', 'Non envoyé',
     '[{"description":"Enseigne lumineuse bandeau + croix pharmacie clignotante","unite":"forfait","quantite":1,"prix_unitaire":7083,"tva_taux":20}]'::jsonb, 'SARL Pharmacie Normandie');

  INSERT INTO compte_rendus (chantier_id, date, numero, resume, participants, decisions) VALUES
    (v_ch3, '2026-01-20', 1, 'Réunion validation DCE. Tous les lots consultés. Privilégier CVC VRV pour maîtrise conso. Report lot mobilier en lot séparé post-travaux.',
     'Dursun (MOE), Mme Dubois (MOA Pharmacie), Architecte Mme Lambert', 'Validation DCE signée. Lancement consultation lot CFO/CFA + CVC en priorité.'),
    (v_ch3, '2026-02-18', 2, 'Point hebdomadaire. Démolition terminée, base-vie installée. Avance de 3 jours sur planning. Début cloisons planifié 05/03.',
     'Dursun (MOE), Mme Dubois (MOA), Placo Expert, Lefèvre', 'Validation plan implantation mobilier. Dépôt dossier conformité ERP avant 30/03.'),
    (v_ch3, '2026-03-10', 3, 'Réunion coordination lots techniques. Synchronisation électricité + CVC pour passage gaines. Validation point chaud. ABF (façade) OK.',
     'Dursun (MOE), Lefèvre, Climatis Normandie, BET Fluides', 'Validation percements dalles. Demande devis complémentaire Climatis pour désenfumage zone stockage.');

  INSERT INTO taches (chantier_id, titre, priorite, statut, echeance, lot) VALUES
    (v_ch3, 'Déposer le dossier conformité ERP mairie',          'Urgent',  'En attente', '2026-03-30', 'Administratif'),
    (v_ch3, 'Valider l''enseigne avec la mairie',                 'Urgent',  'Planifié',   '2026-04-05', 'Enseigne'),
    (v_ch3, 'Coordonner livraison rayonnage avec l''artisan',     'Normale', 'En attente', '2026-05-10', 'Mobilier'),
    (v_ch3, 'Tests de pression climatisation + rapport',          'Normale', 'Planifié',   '2026-04-20', 'CVC'),
    (v_ch3, 'Visite de conformité accessibilité PMR',             'Urgent',  'Planifié',   '2026-06-05', 'Conformité'),
    (v_ch3, 'Relance Lefèvre pour planning câblage VDI',          'Normale', 'Terminé',    '2026-02-25', 'Électricité');

  ALTER TABLE chantiers      ENABLE TRIGGER chantiers_notify_after_insert;
  ALTER TABLE taches         ENABLE TRIGGER taches_notify_after_insert;
  ALTER TABLE compte_rendus  ENABLE TRIGGER compte_rendus_notify_after_insert;
  ALTER TABLE ordres_service ENABLE TRIGGER ordres_service_notify_after_insert;
END;
$$;

COMMIT;
