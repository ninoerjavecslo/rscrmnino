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
  website?: string | null
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
  initial_contract_value?: number | null
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
  billing_month?: number | null
  status: 'active' | 'paused' | 'cancelled'
  provider?: string | null
  maintenance_id?: string | null
  accounting_email?: boolean
  notes?: string | null
  contract_id?: string | null
  contract_expiry?: string | null
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
  cancelled_from?: string | null
  notes?: string | null
}

export interface Domain {
  id: string
  client_id?: string | null
  project_pn: string
  domain_name: string
  registered_date?: string | null
  expiry_date: string
  yearly_amount?: number | null
  contract_id?: string | null
  registrar?: string | null
  auto_renew: boolean
  billable: boolean
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
  project_pn?: string | null
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
  status: 'planned' | 'paid' | 'issued' | 'retainer' | 'cost' | 'deferred'
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
  project_id?: string | null
  maintenance_id?: string | null
  title: string
  description?: string | null
  status: 'pending' | 'approved' | 'billed'
  amount?: number | null
  notes?: string | null
  probability?: number | null
  deal_type?: 'one_time' | 'monthly' | 'fixed' | null
  expected_month?: string | null
  expected_end_month?: string | null
  monthly_schedule?: Array<{ month: string; amount: number }> | null
  created_at: string
  // Joined (only available when fetched with select joins)
  maintenance?: { id: string; name: string; client: Pick<Client, 'id' | 'name'> | null } | null
  project?: Pick<Project, 'id' | 'pn' | 'name' | 'client_id'> | null
}

// ── Hosting active-in-month helper ───────────────────────────────────────────
// Returns true if the hosting client should generate revenue in the given month.
// Cancelled clients are active for months strictly before cancelled_from.
// month format: YYYY-MM-01 (same as cancelled_from)
export function hostingActiveInMonth(
  h: Pick<HostingClient, 'status' | 'cancelled_from' | 'billing_since'>,
  month: string,
): boolean {
  if (h.billing_since) {
    const bs = h.billing_since.slice(0, 7) + '-01'
    if (month < bs) return false
  }
  if (h.status === 'active') return true
  if (h.status === 'cancelled' && h.cancelled_from) return month < h.cancelled_from
  return false
}

// ── Hosting annual value helper ──────────────────────────────────────────────
// Returns how much a hosting client will be billed in the given calendar year.
// Accounts for: billing_since (partial first year), contract_expiry, cancelled_from.
// This is the single source of truth used by the Hosting table, stat cards,
// ForecastView, and client value summaries.
export function hostingAnnualValue(
  h: Pick<HostingClient, 'cycle' | 'amount' | 'billing_since' | 'contract_expiry' | 'status' | 'cancelled_from'>,
  year: number = new Date().getFullYear(),
): number {
  if (h.cycle === 'yearly') return h.amount  // one payment per year regardless

  const yearStart = `${year}-01-01`
  const yearEnd   = `${year}-12-01`

  // Effective end: earliest of Dec, contract_expiry, or month before cancelled_from
  let effEnd = yearEnd
  if (h.contract_expiry) {
    const expiry = h.contract_expiry.slice(0, 7) + '-01'
    if (expiry < effEnd) effEnd = expiry
  }
  if (h.status === 'cancelled' && h.cancelled_from) {
    // cancelled_from = first month NOT billed → last billed = one month before
    const cf = new Date(h.cancelled_from + 'T00:00:00')
    cf.setMonth(cf.getMonth() - 1)
    const lastBilled = `${cf.getFullYear()}-${String(cf.getMonth() + 1).padStart(2, '0')}-01`
    if (lastBilled < effEnd) effEnd = lastBilled
  }

  // billing_since constrains the start when it falls within the current year
  let effStart = yearStart
  if (h.billing_since) {
    const bs = h.billing_since.slice(0, 7) + '-01'
    if (bs > yearStart) effStart = bs
  }

  if (effStart > effEnd) return 0
  const [sy, sm] = effStart.split('-').map(Number)
  const [ey, em] = effEnd.split('-').map(Number)
  return Math.max(0, (ey - sy) * 12 + (em - sm) + 1) * h.amount
}

/** @deprecated Use hostingAnnualValue instead */
export function hostingContractValue(h: Pick<HostingClient, 'cycle' | 'amount' | 'billing_since' | 'contract_expiry'>): number {
  return hostingAnnualValue({ ...h, status: 'active', cancelled_from: null })
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
      invoice_automations: {
        Row: Omit<InvoiceAutomation, 'client'>
        Insert: Omit<InvoiceAutomation, 'id' | 'created_at' | 'updated_at' | 'client'>
        Update: Partial<Omit<InvoiceAutomation, 'id' | 'created_at' | 'updated_at' | 'client'>>
      }
    }
  }
}

export interface Automation {
  id: string
  name: string
  recipient_email: string
  send_day: number       // 1–28: day of month to send
  active: boolean
  subject?: string | null  // email subject line (defaults to name — month year)
  message?: string | null  // optional intro message shown in email body
  notes?: string | null
  sent_count: number
  last_sent_at?: string | null
  created_at: string
  updated_at: string
}

export interface AutomationItem {
  id: string
  automation_id: string
  client_id: string
  contract_ref?: string | null
  pn: string
  description_template: string   // supports {month} and {year}
  quantity: number
  unit_price: number
  due_days: number
  sort_order: number
  hosting_client_id?: string | null
  created_at: string
  // Joined
  client?: { id: string; name: string } | null
}

export interface InvoiceAutomation {
  id: string
  name: string
  client_id: string
  contract_ref?: string | null
  pn: string
  description_template: string
  quantity: number
  unit_price: number
  due_days: number
  hosting_client_id?: string | null
  maintenance_id?: string | null
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
  client?: { id: string; name: string } | null
}

export interface ReminderRule {
  id: string
  name: string
  trigger_type: 'domain_expiry' | 'maintenance_end' | 'hosting_renewal' | 'pipeline_stale'
  days_before: number
  recipient_email: string
  active: boolean
  notes?: string | null
  // Domain expiry invoice generation
  invoice_email?: string | null      // if set, send invoice-style email to accounting
  invoice_pn?: string | null         // PN for invoice lines (default '6820')
  invoice_unit_price?: number | null // price per domain
  invoice_due_days?: number | null   // payment due days
  last_run_at?: string | null
  created_at: string
  updated_at: string
}

// ── Resource Planning ─────────────────────────────────────────────────────────

export interface Team {
  id: string
  name: string
  color: string
  display_order: number
  created_at: string
}

export interface TeamMember {
  id: string
  name: string
  email?: string | null
  role?: string | null
  team_id?: string | null
  skills?: string | null
  hours_per_day: number
  display_order: number
  active: boolean
  share_token: string
  created_at: string
  // Joined
  team?: Pick<Team, 'id' | 'name' | 'color'> | null
}

export interface MemberProject {
  id: string
  member_id: string
  project_id: string
  role?: string | null
  created_at: string
  // Joined
  project?: Pick<Project, 'id' | 'pn' | 'name' | 'status' | 'type'> & { client?: Pick<Client, 'id' | 'name'> | null } | null
}

export interface TimeOff {
  id: string
  member_id: string
  start_date: string
  end_date: string
  reason?: string | null
  created_at: string
}

export type AllocationCategory = 'project' | 'maintenance' | 'internal' | 'meeting' | 'admin' | 'leave' | 'sales'

export interface ResourceAllocation {
  id: string
  member_id: string
  project_id?: string | null
  category: AllocationCategory
  date: string           // YYYY-MM-DD
  hours: number
  label?: string | null
  notes?: string | null
  recurring_group_id?: string | null
  is_billable: boolean
  deadline_date?: string | null  // YYYY-MM-DD
  is_unplanned: boolean
  displaced_allocation_id?: string | null
  created_at: string
  // Joined
  member?: Pick<TeamMember, 'id' | 'name'> | null
  project?: Pick<Project, 'id' | 'pn' | 'name'> | null
}

export interface TemplateEntry {
  member_id: string
  member_name: string
  project_id: string | null
  project_label: string
  category: AllocationCategory
  weekly_hours: number
  is_billable: boolean
}

export interface AllocationTemplate {
  id: string
  name: string
  entries: TemplateEntry[]
  created_at: string
}

export interface ProjectDeliverable {
  id: string
  project_id: string
  title: string
  due_date: string        // YYYY-MM-DD
  estimated_hours?: number | null
  team?: string | null
  status: 'active' | 'completed' | 'delayed'
  notes?: string | null
  created_at: string
  // Joined
  project?: Pick<Project, 'id' | 'pn' | 'name'> | null
}

export interface ResourceConfirmation {
  id: string
  member_id: string
  date: string           // YYYY-MM-DD
  status: 'confirmed' | 'delayed'
  delay_reason?: string | null
  confirmed_at: string
}

export interface AllocationActual {
  id: string
  allocation_id: string
  member_id: string
  date: string           // YYYY-MM-DD
  actual_hours: number
  note?: string | null
  created_at: string
}

// ── Pixel AI ──────────────────────────────────────────────────────────────────

export interface PixelConversation {
  id: string
  title: string | null
  created_at: string
  updated_at: string
}

export interface PixelMessage {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  model: 'claude' | 'gpt4o' | null
  created_at: string
}
