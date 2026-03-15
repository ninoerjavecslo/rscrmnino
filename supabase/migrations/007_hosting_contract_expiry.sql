-- Add contract expiry date to hosting clients
ALTER TABLE hosting_clients ADD COLUMN IF NOT EXISTS contract_expiry date;
