// Barème de référence ID Maîtrise pour le chiffrage estimatif (DPGF) :
// prix unitaires HT validés par le maître d'œuvre sur ses derniers dossiers
// de maisons individuelles (Le Havre / Normandie, 2026) — DPGF-2026-030
// (R+1 toit terrasse, 184 m² de référence) et pavillon 146 m² (toiture
// tuiles). Les prix des OS (réellement payés) passent avant ce barème ; le
// barème passe avant les prix « du marché » de l'IA.
// Données pures : utilisées par /api/chiffrage/ia (génération, relecture).

export const BAREME_ID_MAITRISE = [
  { lot: "IMPLANTATION", designation: "Implantation de l'ouvrage", unite: "Ft", pu_ht: 250 },
  { lot: "TERRASSEMENT, VRD", designation: "Décapage terre végétale sur emprise + 1 m", unite: "m²", pu_ht: 4 },
  { lot: "TERRASSEMENT, VRD", designation: "Fouilles en rigole pour fondations (périphérie + refends)", unite: "ml", pu_ht: 22 },
  { lot: "TERRASSEMENT, VRD", designation: "Évacuation des terres excédentaires en décharge", unite: "m³", pu_ht: 25 },
  { lot: "TERRASSEMENT, VRD", designation: "Plateforme, remblais, compactage", unite: "Ft", pu_ht: 1200 },
  { lot: "TERRASSEMENT, VRD", designation: "Raccordement des réseaux secs et humides (EU/EV, eau potable, EDF, télécom) jusqu'aux coffrets et regards en limite, quelques mètres", unite: "Ft", pu_ht: 1500 },
  { lot: "GROS ŒUVRE, MAÇONNERIE", designation: "Béton de propreté + semelles filantes BA", unite: "ml", pu_ht: 110 },
  { lot: "GROS ŒUVRE, MAÇONNERIE", designation: "Soubassement vide sanitaire, blocs béton, chaînages, ventilations", unite: "ml", pu_ht: 90 },
  { lot: "GROS ŒUVRE, MAÇONNERIE", designation: "Protection des soubassements, enduit bitumineux + membrane alvéolée", unite: "ml", pu_ht: 25 },
  { lot: "GROS ŒUVRE, MAÇONNERIE", designation: "Réseaux sous plancher, attentes EU/EV, fourreaux", unite: "Ft", pu_ht: 1500 },
  { lot: "GROS ŒUVRE, MAÇONNERIE", designation: "Plancher bas sur vide sanitaire, poutrelles hourdis + dalle de compression", unite: "m²", pu_ht: 110 },
  { lot: "GROS ŒUVRE, MAÇONNERIE", designation: "Dallage BA garage sur terre-plein", unite: "m²", pu_ht: 55 },
  { lot: "GROS ŒUVRE, MAÇONNERIE", designation: "Élévation murs RDC, parpaings 20 cm, chaînages, poteaux", unite: "m²", pu_ht: 65 },
  { lot: "GROS ŒUVRE, MAÇONNERIE", designation: "Murs de refend porteurs RDC", unite: "m²", pu_ht: 65 },
  { lot: "GROS ŒUVRE, MAÇONNERIE", designation: "Plancher intermédiaire, poutrelles hourdis + dalle de compression (38 + 130 m²)", unite: "m²", pu_ht: 100 },
  { lot: "GROS ŒUVRE, MAÇONNERIE", designation: "Élévation murs étage, parpaings 20 cm, chaînages", unite: "m²", pu_ht: 65 },
  { lot: "GROS ŒUVRE, MAÇONNERIE", designation: "Linteaux, appuis, seuils, tableaux", unite: "u", pu_ht: 170 },
  { lot: "GROS ŒUVRE, MAÇONNERIE", designation: "Escalier béton quart tournant", unite: "Ft", pu_ht: 2200 },
  { lot: "GROS ŒUVRE, MAÇONNERIE", designation: "Arases, relevés, scellements, finitions maçonnerie", unite: "Ft", pu_ht: 2000 },
  { lot: "TOITURE TERRASSE, ÉTANCHÉITÉ, EP", designation: "Primaire d'imprégnation à froid (EIF) sur dalle béton", unite: "m²", pu_ht: 3 },
  { lot: "TOITURE TERRASSE, ÉTANCHÉITÉ, EP", designation: "Pare-vapeur bitumineux soudé avec relevés", unite: "m²", pu_ht: 10 },
  { lot: "TOITURE TERRASSE, ÉTANCHÉITÉ, EP", designation: "Isolation PIR toiture-terrasse à pente intégrée", unite: "m²", pu_ht: 32 },
  { lot: "TOITURE TERRASSE, ÉTANCHÉITÉ, EP", designation: "Étanchéité EPDM 1,20 mm, relevés et points singuliers", unite: "m²", pu_ht: 22 },
  { lot: "TOITURE TERRASSE, ÉTANCHÉITÉ, EP", designation: "Protection gravillonnée", unite: "m²", pu_ht: 6 },
  { lot: "TOITURE TERRASSE, ÉTANCHÉITÉ, EP", designation: "Acrotères et couvertines aluminium", unite: "ml", pu_ht: 35 },
  { lot: "TOITURE TERRASSE, ÉTANCHÉITÉ, EP", designation: "Évacuations EP, boîtes à eau, trop-pleins, descentes", unite: "Ft", pu_ht: 2400 },
  { lot: "TOITURE TERRASSE, ÉTANCHÉITÉ, EP", designation: "Solins, contrôle points singuliers, essai d'étanchéité", unite: "Ft", pu_ht: 900 },
  { lot: "MENUISERIES EXTÉRIEURES", designation: "Fenêtres 2 vantaux alu/PVC gris anthracite (étage ×6, RDC ×2)", unite: "u", pu_ht: 820 },
  { lot: "MENUISERIES EXTÉRIEURES", designation: "Fenêtre SDB RDC vitrage opaque", unite: "u", pu_ht: 450 },
  { lot: "MENUISERIES EXTÉRIEURES", designation: "Baies coulissantes grande dimension, séjour / extension", unite: "u", pu_ht: 2000 },
  { lot: "MENUISERIES EXTÉRIEURES", designation: "Baie coulissante latérale extension", unite: "u", pu_ht: 1800 },
  { lot: "MENUISERIES EXTÉRIEURES", designation: "Porte-fenêtre 1 vantail", unite: "u", pu_ht: 900 },
  { lot: "MENUISERIES EXTÉRIEURES", designation: "Porte d'entrée aluminium", unite: "u", pu_ht: 2200 },
  { lot: "MENUISERIES EXTÉRIEURES", designation: "Porte de garage sectionnelle motorisée", unite: "u", pu_ht: 2100 },
  { lot: "MENUISERIES EXTÉRIEURES", designation: "Volets roulants électriques", unite: "u", pu_ht: 350 },
  { lot: "MENUISERIES EXTÉRIEURES", designation: "Pose fenêtres, baies et portes-fenêtres", unite: "u", pu_ht: 210 },
  { lot: "MENUISERIES EXTÉRIEURES", designation: "Pose porte d'entrée", unite: "u", pu_ht: 420 },
  { lot: "MENUISERIES EXTÉRIEURES", designation: "Pose porte de garage", unite: "u", pu_ht: 600 },
  { lot: "FAÇADES", designation: "Enduit monocouche teinté", unite: "m²", pu_ht: 25 },
  { lot: "FAÇADES", designation: "Parement plaquettes pierre (garage + extension), fourniture et colle", unite: "m²", pu_ht: 60 },
  { lot: "FAÇADES", designation: "Parement plaquettes pierre, main d'œuvre de pose", unite: "m²", pu_ht: 40 },
  { lot: "ISOLATION, CLOISONS, PLACO", designation: "Doublage isolant murs périphériques, laine minérale + BA13 sur ossature", unite: "m²", pu_ht: 45 },
  { lot: "ISOLATION, CLOISONS, PLACO", designation: "Cloisons de distribution 72/98 isolées", unite: "m²", pu_ht: 45 },
  { lot: "ISOLATION, CLOISONS, PLACO", designation: "Plafonds suspendus BA13 sous dalle de toiture (isolation par l'extérieur, cf. lot 05)", unite: "m²", pu_ht: 38 },
  { lot: "ISOLATION, CLOISONS, PLACO", designation: "Plafonds suspendus BA13, sous plancher intermédiaire", unite: "m²", pu_ht: 45 },
  { lot: "ISOLATION, CLOISONS, PLACO", designation: "Isolation et cloison séparative garage / habitation", unite: "Ft", pu_ht: 1000 },
  { lot: "MENUISERIES INTÉRIEURES", designation: "Blocs-portes intérieurs, fourniture et pose", unite: "u", pu_ht: 280 },
  { lot: "MENUISERIES INTÉRIEURES", designation: "Bloc-porte communication garage EI30", unite: "u", pu_ht: 650 },
  { lot: "MENUISERIES INTÉRIEURES", designation: "Garde-corps trémie + main courante escalier", unite: "Ft", pu_ht: 1200 },
  { lot: "PLOMBERIE, SANITAIRES", designation: "Installation, implantation des réseaux", unite: "Ft", pu_ht: 500 },
  { lot: "PLOMBERIE, SANITAIRES", designation: "Alimentation générale, vanne, réducteur, filtre, collecteurs", unite: "Ft", pu_ht: 680 },
  { lot: "PLOMBERIE, SANITAIRES", designation: "Distribution EF/EC multicouche sur 2 niveaux", unite: "Ft", pu_ht: 2500 },
  { lot: "PLOMBERIE, SANITAIRES", designation: "Réseaux d'évacuation EU/EV PVC", unite: "Ft", pu_ht: 2200 },
  { lot: "PLOMBERIE, SANITAIRES", designation: "Attentes cuisine et cellier (évier, LV, LL)", unite: "Ft", pu_ht: 750 },
  { lot: "PLOMBERIE, SANITAIRES", designation: "Ensemble douche RDC, receveur extra-plat, paroi, mitigeur thermostatique", unite: "u", pu_ht: 1800 },
  { lot: "PLOMBERIE, SANITAIRES", designation: "Ensemble douche / baignoire SDB étage", unite: "u", pu_ht: 1800 },
  { lot: "PLOMBERIE, SANITAIRES", designation: "Meubles vasque + mitigeur + miroir", unite: "u", pu_ht: 950 },
  { lot: "PLOMBERIE, SANITAIRES", designation: "WC suspendus, bâti, cuvette, plaque", unite: "u", pu_ht: 1000 },
  { lot: "PLOMBERIE, SANITAIRES", designation: "Chauffe-eau thermodynamique 200 L, fourni posé", unite: "u", pu_ht: 2200 },
  { lot: "CHAUFFAGE PAR POMPE À CHALEUR ET PLANCHER CHAUFFANT", designation: "Pompe à chaleur air/eau ~6 kW, fournie posée (puissance à confirmer par l'étude thermique RE2020)", unite: "u", pu_ht: 6800 },
  { lot: "CHAUFFAGE PAR POMPE À CHALEUR ET PLANCHER CHAUFFANT", designation: "Plancher chauffant hydraulique RDC + étage, isolant, tubes, collecteurs", unite: "m²", pu_ht: 34 },
  { lot: "CHAUFFAGE PAR POMPE À CHALEUR ET PLANCHER CHAUFFANT", designation: "Régulation plancher chauffant par zone, thermostats, mise en service", unite: "Ft", pu_ht: 1200 },
  { lot: "CLIMATISATION GAINABLE", designation: "Climatisation gainable ~7 kW froid, unité extérieure + unité intérieure gainable, fonctionnement froid seul (chauffage assuré par le plancher chauffant)", unite: "u", pu_ht: 6800 },
  { lot: "CLIMATISATION GAINABLE", designation: "Réseau aéraulique en faux-plafond, plénums, gaines isolées, grilles de soufflage et de reprise", unite: "Ft", pu_ht: 4200 },
  { lot: "CLIMATISATION GAINABLE", designation: "Pose, liaisons frigorifiques, évacuation des condensats, raccordements électriques", unite: "Ft", pu_ht: 3200 },
  { lot: "CLIMATISATION GAINABLE", designation: "Régulation par zones, verrouillage du mode chaud, mise en service, essais", unite: "Ft", pu_ht: 800 },
  { lot: "ÉLECTRICITÉ, COURANTS FAIBLES, VMC", designation: "Étude de principe et repérage", unite: "Ft", pu_ht: 350 },
  { lot: "ÉLECTRICITÉ, COURANTS FAIBLES, VMC", designation: "Tableau électrique, différentiels, disjoncteurs", unite: "Ft", pu_ht: 1300 },
  { lot: "ÉLECTRICITÉ, COURANTS FAIBLES, VMC", designation: "Distribution, circuits prises", unite: "Ft", pu_ht: 2100 },
  { lot: "ÉLECTRICITÉ, COURANTS FAIBLES, VMC", designation: "Circuits d'éclairage, points lumineux, va-et-vient", unite: "Ft", pu_ht: 1300 },
  { lot: "ÉLECTRICITÉ, COURANTS FAIBLES, VMC", designation: "Appareillage, prises, interrupteurs, DCL", unite: "Ft", pu_ht: 1600 },
  { lot: "ÉLECTRICITÉ, COURANTS FAIBLES, VMC", designation: "Circuits spécialisés (PAC, cuisson, LL, LV, VR, porte garage, VMC, ECS)", unite: "Ft", pu_ht: 1200 },
  { lot: "ÉLECTRICITÉ, COURANTS FAIBLES, VMC", designation: "Réseau communication, RJ45, TV, fibre", unite: "Ft", pu_ht: 500 },
  { lot: "ÉLECTRICITÉ, COURANTS FAIBLES, VMC", designation: "Mise à la terre et liaisons équipotentielles", unite: "Ft", pu_ht: 400 },
  { lot: "ÉLECTRICITÉ, COURANTS FAIBLES, VMC", designation: "Éclairage et prises extérieurs", unite: "Ft", pu_ht: 400 },
  { lot: "ÉLECTRICITÉ, COURANTS FAIBLES, VMC", designation: "VMC simple flux hygro B, caisson, gaines, bouches", unite: "Ft", pu_ht: 1400 },
  { lot: "ÉLECTRICITÉ, COURANTS FAIBLES, VMC", designation: "Contrôles, Consuel, mise en service", unite: "Ft", pu_ht: 800 },
  { lot: "CHAPES, CARRELAGE, PARQUET", designation: "Chape fluide sur plancher chauffant", unite: "m²", pu_ht: 25 },
  { lot: "CHAPES, CARRELAGE, PARQUET", designation: "Carrelage sol, RDC + SDB/WC étage (fourniture et pose)", unite: "m²", pu_ht: 50 },
  { lot: "CHAPES, CARRELAGE, PARQUET", designation: "Plinthes carrelage", unite: "ml", pu_ht: 8 },
  { lot: "CHAPES, CARRELAGE, PARQUET", designation: "Faïence murale SDB", unite: "m²", pu_ht: 55 },
  { lot: "CHAPES, CARRELAGE, PARQUET", designation: "Système d'étanchéité sous douche (SPEC)", unite: "u", pu_ht: 250 },
  { lot: "CHAPES, CARRELAGE, PARQUET", designation: "Parquet contrecollé compatible plancher chauffant, chambres, dressing, palier étage", unite: "m²", pu_ht: 50 },
  { lot: "CHAPES, CARRELAGE, PARQUET", designation: "Plinthes bois", unite: "ml", pu_ht: 10 },
  { lot: "PEINTURE", designation: "Murs, impression + 2 couches (hors faïence)", unite: "m²", pu_ht: 12 },
  { lot: "PEINTURE", designation: "Plafonds, impression + 2 couches", unite: "m²", pu_ht: 13 },
  { lot: "CHARPENTE, COUVERTURE", designation: "Charpente bois (fermettes ou traditionnelle), fourniture", unite: "m²", pu_ht: 50, note: "7 000 € pour 140 m² de toiture" },
  { lot: "CHARPENTE, COUVERTURE", designation: "Charpente bois, pose", unite: "m²", pu_ht: 25, note: "3 500 € pour 140 m² de toiture" },
  { lot: "CHARPENTE, COUVERTURE", designation: "Couverture tuiles, fourniture et pose", unite: "m²", pu_ht: 60 },
  { lot: "CHARPENTE, COUVERTURE", designation: "Gouttières et descentes", unite: "ml", pu_ht: 30 },
  { lot: "FAÇADES", designation: "Ravalement, enduit de façade", unite: "m²", pu_ht: 26.5 },
]

// Habitudes du maître d'œuvre et règles de bon sens, données à l'IA.
export const REGLES_ID_MAITRISE = `Habitudes ID Maîtrise pour un DPGF :
- Lots numérotés 01, 02… ; postes numérotés <lot>.<n>. Intitulés de lots en majuscules,
  par exemple : IMPLANTATION ; TERRASSEMENT, VRD ; GROS ŒUVRE, MAÇONNERIE ; TOITURE
  TERRASSE, ÉTANCHÉITÉ, EP (ou CHARPENTE, COUVERTURE) ; MENUISERIES EXTÉRIEURES ;
  FAÇADES ; ISOLATION, CLOISONS, PLACO ; MENUISERIES INTÉRIEURES ; PLOMBERIE,
  SANITAIRES ; CHAUFFAGE (préciser le système) ; CLIMATISATION si demandée ;
  ÉLECTRICITÉ, COURANTS FAIBLES, VMC ; CHAPES, CARRELAGE, PARQUET ; PEINTURE.
- Lot IMPLANTATION : une seule ligne « Implantation de l'ouvrage », 1 Ft, 250 € HT.
  Pas de poste d'installation de chantier ni de nettoyage.
- La VMC est dans le lot électricité. Chauffage et climatisation sont deux lots séparés.
- Puissances cohérentes (RE2020, Normandie) : chauffage 25 à 35 W/m², froid 35 à
  45 W/m² ; une climatisation de confort en complément d'un plancher chauffant est en
  froid seul. Puissance de PAC « à confirmer par l'étude thermique RE2020 ».
- Plâtrerie : doublages, cloisons et plafonds autour de 45 € HT/m² fourni posé.
- Unités : u, Ft (forfait), m², m³, ml, mois. Prix HT, TVA 20 % en neuf.
- Non compris habituels : piscine, gestion des eaux pluviales à la parcelle, terrasse,
  allées, clôtures, espaces verts, cuisine équipée, placards, étude RE2020, honoraires
  d'architecte, frais de branchement des concessionnaires, étude de sol, assurance
  dommages-ouvrage.
- Ratio de comparaison : TTC, maîtrise d'œuvre comprise, sur la surface habitable + la
  moitié du garage. Une maison R+1 de ce type se situe autour de 1 650 à 1 900 € TTC/m².`
