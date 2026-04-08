-- Intégration Odoo Sign sur les Ordres de Service
ALTER TABLE ordres_service
  ADD COLUMN IF NOT EXISTS artisan_adresse   text,
  ADD COLUMN IF NOT EXISTS odoo_sign_id      integer,
  ADD COLUMN IF NOT EXISTS odoo_sign_url     text,
  ADD COLUMN IF NOT EXISTS statut_signature  text DEFAULT 'Non envoyé';
