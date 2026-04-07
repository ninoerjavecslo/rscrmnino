-- Add client_id foreign key to offers table
alter table offers
  add column if not exists client_id uuid references clients(id) on delete set null;

create index if not exists idx_offers_client_id on offers(client_id);
