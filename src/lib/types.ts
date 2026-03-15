// ============================================================
//  Renderspace — shared TypeScript types (mirrors Supabase schema)
// ============================================================

export interface Client {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  address?: string | null
  vat_id?: string | null
  notes?: string | null
  contact_person?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  client_id?: string | null
  pn: string                 // e.g. RS-2026-001
  name: string
  type: 'fixed' | 'maintenance' | 'variable'
  status: 'active' | 'paused' | 'completed' | 'cancelled'
  pm?: string | null
  contract_value?: number | null
  currency: string
  start_date?: string | null
  end_date?: string | null
  notes?: string | null
  contract_url?: string | null
  // Joined from clients table
  client?: Pick<Client, 'id' | 'name'> | null
}

export interface Invoice {
  id: string
  project_id?: string | null
  client_id?: string | null
  invoice_number?: string | null
  status: 'draft' | 'issued' | 'paid' | 'overdue' | 'cancelled'
  issued_date?: string | null
  due_date?: string | null
  paid_date?: string | null
  subtotal: number
  tax_rate: number
  tax_amount: number
  total: number
  currency: string
  notes?: string | null
  // Joined
  client?: Pick<Client, 'id' | 'name'> | null
  project?: Pick<Project, 'id' | 'pn' | 'name'> | null
}

export interface HostingClient {
  id: string
  client_id: string
  project_pn: string
  description?: string | null
  cycle: 'monthly' | 'yearly'
  amount: number
  billing_since?: string | null
  next_invoice_date?: string | null
  status: 'active' | 'paused' | 'cancelled'
  maintenance_id?: string | null
  accounting_email?: boolean
  notes?: string | null
  contract_id?: string | null
  cancelled_from?: string | null
  // Joined
  client?: Pick<Client, 'id' | 'name'> | null
}

export interface InfrastructureCost {
  id: string
  provider: string
  description?: string | null
  monthly_cost: number
  billing_cycle: 'monthly' | 'annual' | 'variable'
  status: 'active' | 'inactive'
  notes?: string | null
}

export interface Domain {
  id: string
  client_id?: string | null
  project_pn: string
  domain_name: string
  expiry_date: string
  yearly_amount?: number | null
  contract_id?: string | null
  registrar?: string | null
  auto_renew: boolean
  status: 'active' | 'expiring_soon' | 'expired'  // computed column in DB
  accounting_email?: boolean
  archived?: boolean
  notes?: string | null
  // Joined
  client?: Pick<Client, 'id' | 'name'> | null
}

export interface Maintenance {
  id: string
  client_id: string
  name: string
  monthly_retainer: number
  help_requests_included: number
  hours_included: number
  contract_start: string   // YYYY-MM-DD
  contract_end?: string | null
  contract_url?: string | null
  status: 'active' | 'paused' | 'cancelled'
  notes?: string | null
  created_at: string
  // Joined
  client?: Pick<Client, 'id' | 'name'> | null
  hosting_clients?: { id: string }[] | null
}

export interface TimesheetEntry {
  id: string
  user_id?: string | null
  month: string              // first day: 2026-03-01
  project_pn: string
  project_name?: string | null
  description?: string | null
  hours: number
  allocation_pct?: number | null
  total_month_hours?: number | null
  ai_generated: boolean
  created_at: string
}

export interface RevenuePlanner {
  id: string
  project_id?: string | null
  maintenance_id?: string | null
  hosting_client_id?: string | null
  domain_id?: string | null
  month: string
  planned_amount?: number | null
  actual_amount?: number | null
  status: 'planned' | 'paid' | 'issued' | 'retainer' | 'cost'
  probability: number  // 25 | 50 | 75 | 100
  invoice_id?: string | null
  notes?: string | null
  // Joined
  project?: Pick<Project, 'id' | 'pn' | 'name' | 'type' | 'client_id'> | null
  maintenance?: { id: string; name: string; client: Pick<Client, 'id' | 'name'> | null } | null
  hosting?: { id: string; description?: string | null; client: Pick<Client, 'id' | 'name'> | null } | null
  domain?: { id: string; domain_name: string; client: Pick<Client, 'id' | 'name'> | null } | null
}

export interface PipelineItem {
  id: string
  client_id?: string | null
  company_name?: string | null  // free-text for prospects not in client list
  title: string
  description?: string | null
  estimated_amount?: number | null
  probability: number        // 10 | 25 | 50 | 75 | 90
  deal_type: 'one_time' | 'monthly' | 'fixed'
  expected_month?: string | null      // YYYY-MM-DD (start month)
  expected_end_month?: string | null  // YYYY-MM-DD (end month, for monthly deals)
  monthly_schedule?: Array<{ month: string; amount: number }> | null  // for fixed type
  status: 'proposal' | 'won' | 'lost'
  notes?: string | null
  created_at: string
  // Joined
  client?: Pick<Client, 'id' | 'name'> | null
}

export interface ChangeRequest {
  id: string
  project_id: string
  title: string
  description?: string | null
  status: 'pending' | 'approved'
  amount?: number | null
  notes?: string | null
  created_at: string
}

// ── Supabase Database type for typed client ──────────────────────────────────

export interface Database {
  public: {
    Tables: {
      clients: {
        Row: Client
        Insert: Omit<Client, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Client, 'id' | 'created_at' | 'updated_at'>>
      }
      projects: {
        Row: Omit<Project, 'client'>
        Insert: Omit<Project, 'id' | 'client'>
        Update: Partial<Omit<Project, 'id' | 'client'>>
      }
      invoices: {
        Row: Omit<Invoice, 'client' | 'project'>
        Insert: Omit<Invoice, 'id' | 'client' | 'project'>
        Update: Partial<Omit<Invoice, 'id' | 'client' | 'project'>>
      }
      hosting_clients: {
        Row: Omit<HostingClient, 'client'>
        Insert: Omit<HostingClient, 'id' | 'client'>
        Update: Partial<Omit<HostingClient, 'id' | 'client'>>
      }
      infrastructure_costs: {
        Row: InfrastructureCost
        Insert: Omit<InfrastructureCost, 'id'>
        Update: Partial<Omit<InfrastructureCost, 'id'>>
      }
      domains: {
        Row: Omit<Domain, 'client'>
        Insert: Omit<Domain, 'id' | 'status' | 'client'>  // status is computed
        Update: Partial<Omit<Domain, 'id' | 'status' | 'client'>>
      }
      timesheet_entries: {
        Row: TimesheetEntry
        Insert: Omit<TimesheetEntry, 'id' | 'created_at'>
        Update: Partial<Omit<TimesheetEntry, 'id' | 'created_at'>>
      }
      revenue_planner: {
        Row: Omit<RevenuePlanner, 'project'>
        Insert: Omit<RevenuePlanner, 'id' | 'project'>
        Update: Partial<Omit<RevenuePlanner, 'id' | 'project'>>
      }
    }
  }
}
