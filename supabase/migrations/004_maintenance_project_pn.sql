-- Add project_pn to maintenance contracts
ALTER TABLE maintenances ADD COLUMN IF NOT EXISTS project_pn text;
