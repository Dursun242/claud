-- ═══════════════════════════════════════════════════════════════
-- SCRIPT DE RÉCUPÉRATION ACCÈS ADMIN
-- ═══════════════════════════════════════════════════════════════
-- À exécuter dans Supabase > SQL Editor si tu n'arrives plus
-- à te connecter avec ton compte Google.
--
-- ÉTAPES :
-- 1. Va sur https://supabase.com/dashboard
-- 2. Ouvre ton projet → SQL Editor
-- 3. Remplace TON_EMAIL@gmail.com par ton email Google réel
-- 4. Exécute le script
-- ═══════════════════════════════════════════════════════════════

-- Remplace la valeur ci-dessous par ton email Google
DO $$
DECLARE
  admin_email TEXT := 'TON_EMAIL@gmail.com';  -- <-- MODIFIE ICI
  admin_prenom TEXT := 'Admin';               -- <-- Ton prénom
  admin_nom TEXT := 'ID Maîtrise';            -- <-- Ton nom
BEGIN

  -- Vérifier si l'email existe déjà
  IF EXISTS (SELECT 1 FROM authorized_users WHERE email = admin_email) THEN
    -- Réactiver si désactivé
    UPDATE authorized_users
    SET actif = true, role = 'admin', updated_at = NOW()
    WHERE email = admin_email;
    RAISE NOTICE 'Utilisateur % réactivé avec le rôle admin.', admin_email;
  ELSE
    -- Insérer le nouvel admin (bypass RLS via SQL Editor qui utilise le rôle postgres)
    INSERT INTO authorized_users (email, prenom, nom, role, actif, added_by_email)
    VALUES (admin_email, admin_prenom, admin_nom, 'admin', true, 'system-recovery');
    RAISE NOTICE 'Utilisateur % créé avec le rôle admin.', admin_email;
  END IF;

END $$;

-- Vérification : affiche les utilisateurs actifs
SELECT id, email, prenom, nom, role, actif, added_at
FROM authorized_users
WHERE actif = true
ORDER BY added_at;
