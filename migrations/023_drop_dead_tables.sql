-- Migration 023 — Suppression des tables mortes (migrations 001 et 002)
--
-- Contexte (audit 2026-06-11) : sept tables créées par les migrations 001
-- et 002 ne sont référencées NULLE PART dans le code applicatif (src/) et
-- portent des policies "Allow all" (002) ou un système de rôles parallèle
-- jamais utilisé (001, table user_roles concurrente d'authorized_users).
-- Elles constituent une surface d'attaque et une dette de confusion.
--
-- ⚠️ PRÉREQUIS : confirmer qu'elles sont VIDES avant d'exécuter (voir
-- 023_README.md, section "Vérification pré-exécution"). Sur Supabase,
-- ces tables n'ont jamais été alimentées par l'app, mais le contrôle
-- coûte une requête et évite toute perte de données.
--
-- CASCADE nettoie automatiquement les objets dépendants : policies RLS
-- (002 + anciennes policies 004 basées sur user_roles, supplantées par 005),
-- index (006), triggers, contraintes FK. Aucune policy canonique de 005 ne
-- référence ces tables (vérifié), donc la RLS en place n'est pas affectée.

-- Tables de la migration 002 (feature validation v3 — colonnes ALTER de
-- ordres_service/compte_rendus CONSERVÉES, seules ces 3 tables sont mortes)
DROP TABLE IF EXISTS public.os_validations  CASCADE;
DROP TABLE IF EXISTS public.cr_commentaires CASCADE;
DROP TABLE IF EXISTS public.chantier_photos CASCADE;

-- Tables de la migration 001 (schéma "refonte" jamais branché côté app)
DROP TABLE IF EXISTS public.photos        CASCADE;  -- FK -> photo_reports
DROP TABLE IF EXISTS public.photo_reports CASCADE;  -- FK -> chantiers
DROP TABLE IF EXISTS public.plans         CASCADE;  -- FK -> chantiers
DROP TABLE IF EXISTS public.user_roles    CASCADE;

-- Fonctions orphelines après suppression des tables ci-dessus.
-- NB : on NE touche PAS à public.is_admin() (sans argument), qui est la
-- fonction CANONIQUE de 005 utilisée par toute la RLS. Seules les
-- surcharges/fonctions de 001 et 002 sont supprimées (signatures distinctes).
DROP FUNCTION IF EXISTS public.update_cr_commentaires_timestamp() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_role(uuid)               CASCADE;
DROP FUNCTION IF EXISTS public.is_admin(uuid)                    CASCADE;
