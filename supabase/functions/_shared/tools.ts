import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Tool definitions for Claude ──────────────────────────────────────────────

export const TOOL_DEFINITIONS = [
  {
    name: 'list_projects',
    description: 'List all projects, optionally filtered by status. Returns project number (pn), name, client, type, status, contract value.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'paused', 'completed', 'cancelled'], description: 'Filter by status. Omit to get all.' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    },
  },
  {
    name: 'get_project_details',
    description: 'Get full details of a single project including its revenue plan entries.',
    input_schema: {
      type: 'object',
      properties: {
        pn: { type: 'string', description: 'Project number e.g. RS-2026-001' },
      },
      required: ['pn'],
    },
  },
  {
    name: 'create_project',
    description: 'Create a new project. Returns the created project including the auto-generated project number.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name' },
        client_id: { type: 'string', description: 'Client ID (UUID). Use list_clients to find it.' },
        type: { type: 'string', enum: ['fixed', 'maintenance', 'variable'], description: 'Contract type' },
        contract_value: { type: 'number', description: 'Contract value in EUR' },
        start_date: { type: 'string', description: 'Start date YYYY-MM-DD' },
        end_date: { type: 'string', description: 'End date YYYY-MM-DD' },
        pm: { type: 'string', description: 'Project manager name' },
        notes: { type: 'string' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'list_clients',
    description: 'List all clients. Returns id, name, email, phone.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Filter by name (case-insensitive)' },
      },
    },
  },
  {
    name: 'create_client',
    description: 'Create a new client.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        address: { type: 'string' },
        vat_id: { type: 'string', description: 'VAT/tax ID e.g. SI12345678' },
        notes: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'list_revenue_plans',
    description: 'List revenue planner entries (planned invoices). Can filter by month, status, project.',
    input_schema: {
      type: 'object',
      properties: {
        month: { type: 'string', description: 'Month as YYYY-MM-01 e.g. 2026-03-01' },
        status: { type: 'string', enum: ['planned', 'issued', 'paid', 'retainer', 'cost'] },
        project_pn: { type: 'string', description: 'Filter by project number e.g. RS-2026-001' },
        overdue_only: { type: 'boolean', description: 'Only issued entries older than current month (not paid)' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    },
  },
  {
    name: 'create_revenue_plan',
    description: 'Add a planned invoice entry to the revenue planner for a specific project and month.',
    input_schema: {
      type: 'object',
      properties: {
        project_pn: { type: 'string', description: 'Project number e.g. RS-2026-001' },
        month: { type: 'string', description: 'Month as YYYY-MM-01 e.g. 2026-03-01' },
        planned_amount: { type: 'number', description: 'Amount in EUR' },
        probability: { type: 'number', enum: [25, 50, 75, 100], description: 'Probability % (default 100)' },
        notes: { type: 'string' },
      },
      required: ['project_pn', 'month', 'planned_amount'],
    },
  },
  {
    name: 'update_revenue_plan_status',
    description: 'Update the status of a revenue plan entry (planned→issued or issued→paid). ALWAYS requires confirmation from the user before executing — return the plan details and ask for confirmation.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Revenue plan entry UUID' },
        new_status: { type: 'string', enum: ['issued', 'paid'], description: 'New status' },
        actual_amount: { type: 'number', description: 'Actual amount (if different from planned)' },
      },
      required: ['id', 'new_status'],
    },
  },
  {
    name: 'list_hosting_clients',
    description: 'List hosting clients with their monthly/yearly revenue amounts and status.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'cancelled', 'paused'], description: 'Filter by status. Omit for all.' },
      },
    },
  },
  {
    name: 'list_domains',
    description: 'List client domains with expiry dates, yearly billing amounts, and renewal status.',
    input_schema: {
      type: 'object',
      properties: {
        archived: { type: 'boolean', description: 'Include archived domains. Default false.' },
        expiring_days: { type: 'number', description: 'Only domains expiring within N days.' },
      },
    },
  },
  {
    name: 'list_infrastructure_costs',
    description: 'List infrastructure costs — what the agency pays providers (servers, hosting platforms).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_maintenances',
    description: 'List maintenance contracts with monthly retainer amounts.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'inactive'], description: 'Filter by status.' },
      },
    },
  },
  {
    name: 'get_monthly_revenue_summary',
    description: 'Get the complete revenue summary for a specific month. Combines revenue planner entries (project invoices), active hosting clients (recurring monthly fees), and active maintenance retainers. Use this whenever the user asks about revenue, income, or earnings for a month.',
    input_schema: {
      type: 'object',
      properties: {
        month: { type: 'string', description: 'Month as YYYY-MM-01 e.g. 2026-03-01. Defaults to current month.' },
      },
    },
  },
  {
    name: 'get_client_overview',
    description: 'Get the full value overview for a client: active projects (contract values), maintenance retainer, hosting clients, and domains. Use this when asked about a client\'s value, total revenue, what we earn from them, or their relationship summary.',
    input_schema: {
      type: 'object',
      properties: {
        client_name: { type: 'string', description: 'Client name or partial name (case-insensitive)' },
      },
      required: ['client_name'],
    },
  },
  {
    name: 'list_pipeline',
    description: 'List sales pipeline deals with estimated amounts and probabilities.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by status (active, won, lost). Omit for active only.' },
      },
    },
  },
]

// ── Tool executors ────────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  supabase: SupabaseClient
): Promise<{ result: unknown; requiresConfirmation?: boolean }> {
  switch (name) {
    case 'list_projects': {
      let q = supabase
        .from('projects')
        .select('id, pn, name, type, status, contract_value, currency, pm, start_date, end_date, client:clients(id, name)')
        .order('created_at', { ascending: false })
        .limit((input.limit as number) || 20)
      if (input.status) q = q.eq('status', input.status)
      const { data, error } = await q
      if (error) return { result: { error: error.message } }
      return { result: data }
    }

    case 'get_project_details': {
      const { data: project, error } = await supabase
        .from('projects')
        .select('*, client:clients(id, name)')
        .eq('pn', input.pn)
        .single()
      if (error) return { result: { error: `Project ${input.pn} not found` } }

      const { data: plans } = await supabase
        .from('revenue_planner')
        .select('id, month, planned_amount, actual_amount, status, probability, notes')
        .eq('project_id', project.id)
        .order('month', { ascending: false })
        .limit(12)

      return { result: { project, revenue_plans: plans } }
    }

    case 'create_project': {
      // Auto-generate next project number
      const year = new Date().getFullYear()
      const { data: latest } = await supabase
        .from('projects')
        .select('pn')
        .like('pn', `RS-${year}-%`)
        .order('pn', { ascending: false })
        .limit(1)
        .single()

      let seq = 1
      if (latest?.pn) {
        const parts = latest.pn.split('-')
        seq = parseInt(parts[parts.length - 1]) + 1
      }
      const pn = `RS-${year}-${String(seq).padStart(3, '0')}`

      const { data, error } = await supabase
        .from('projects')
        .insert({ ...input, pn, currency: 'EUR', status: 'active' })
        .select('*, client:clients(id, name)')
        .single()

      if (error) return { result: { error: error.message } }
      return { result: data }
    }

    case 'list_clients': {
      let q = supabase
        .from('clients')
        .select('id, name, email, phone, vat_id')
        .order('name')
      if (input.search) q = q.ilike('name', `%${input.search}%`)
      const { data, error } = await q
      if (error) return { result: { error: error.message } }
      return { result: data }
    }

    case 'create_client': {
      const { data, error } = await supabase
        .from('clients')
        .insert(input)
        .select()
        .single()
      if (error) return { result: { error: error.message } }
      return { result: data }
    }

    case 'list_revenue_plans': {
      let q = supabase
        .from('revenue_planner')
        .select('id, month, planned_amount, actual_amount, status, probability, notes, project:projects(pn, name, client_id, client:clients(name))')
        .order('month', { ascending: false })
        .limit((input.limit as number) || 20)

      if (input.month) q = q.eq('month', input.month)
      if (input.status) q = q.eq('status', input.status)

      if (input.project_pn) {
        const { data: proj } = await supabase.from('projects').select('id').eq('pn', input.project_pn).single()
        if (proj) q = q.eq('project_id', proj.id)
      }

      if (input.overdue_only) {
        const thisMonth = new Date()
        thisMonth.setDate(1)
        thisMonth.setHours(0, 0, 0, 0)
        q = q.eq('status', 'issued').lt('month', thisMonth.toISOString())
      }

      const { data, error } = await q
      if (error) return { result: { error: error.message } }
      return { result: data }
    }

    case 'create_revenue_plan': {
      // Resolve project_pn to project_id
      const { data: proj, error: projErr } = await supabase
        .from('projects')
        .select('id, name, client:clients(name)')
        .eq('pn', input.project_pn)
        .single()
      if (projErr) return { result: { error: `Project ${input.project_pn} not found` } }

      const { data, error } = await supabase
        .from('revenue_planner')
        .insert({
          project_id: proj.id,
          month: input.month,
          planned_amount: input.planned_amount,
          probability: (input.probability as number) || 100,
          status: 'planned',
          notes: input.notes,
        })
        .select()
        .single()

      if (error) return { result: { error: error.message } }
      return { result: { ...data, project: proj } }
    }

    case 'update_revenue_plan_status': {
      // Validate transition
      const { data: current, error: fetchErr } = await supabase
        .from('revenue_planner')
        .select('id, status, planned_amount, actual_amount, month, project:projects(pn, name, client:clients(name))')
        .eq('id', input.id)
        .single()

      if (fetchErr) return { result: { error: 'Revenue plan not found' } }

      const validTransitions: Record<string, string[]> = { planned: ['issued'], issued: ['paid'] }
      if (!validTransitions[current.status]?.includes(input.new_status as string)) {
        return { result: { error: `Cannot transition from ${current.status} to ${input.new_status}` } }
      }

      // Signal that this requires confirmation — do NOT execute yet
      return {
        result: { pending: true, plan: current, new_status: input.new_status, actual_amount: input.actual_amount },
        requiresConfirmation: true,
      }
    }

    case 'list_hosting_clients': {
      let q = supabase
        .from('hosting_clients')
        .select('id, description, provider, cycle, amount, status, billing_since, contract_expiry, client:clients(name)')
        .order('status')
      if (input.status) q = q.eq('status', input.status)
      const { data, error } = await q
      if (error) return { result: { error: error.message } }
      return { result: data }
    }

    case 'list_domains': {
      let q = supabase
        .from('domains')
        .select('id, domain_name, expiry_date, yearly_amount, archived, project_pn, client:clients(name)')
        .order('expiry_date')
      if (!input.archived) q = q.eq('archived', false)
      if (input.expiring_days) {
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() + (input.expiring_days as number))
        q = q.lte('expiry_date', cutoff.toISOString().slice(0, 10))
      }
      const { data, error } = await q
      if (error) return { result: { error: error.message } }
      return { result: data }
    }

    case 'list_infrastructure_costs': {
      const { data, error } = await supabase
        .from('infrastructure_costs')
        .select('id, provider, description, monthly_cost, billing_cycle, status, cancelled_from')
        .order('provider')
      if (error) return { result: { error: error.message } }
      return { result: data }
    }

    case 'list_maintenances': {
      let q = supabase
        .from('maintenances')
        .select('id, monthly_retainer, status, project_pn, client:clients(name)')
        .order('status')
      if (input.status) q = q.eq('status', input.status)
      const { data, error } = await q
      if (error) return { result: { error: error.message } }
      return { result: data }
    }

    case 'get_monthly_revenue_summary': {
      const targetMonth = (input.month as string) || new Date().toISOString().slice(0, 7) + '-01'

      // 1. Revenue planner entries for this month
      const { data: plannerEntries } = await supabase
        .from('revenue_planner')
        .select('id, planned_amount, actual_amount, status, notes, project:projects(pn, name, client:clients(name))')
        .eq('month', targetMonth)

      // 2. Active hosting clients (monthly revenue)
      const { data: hostingClients } = await supabase
        .from('hosting_clients')
        .select('id, description, amount, cycle, billing_since, client:clients(name)')
        .eq('status', 'active')

      // Compute monthly amount for each hosting client (yearly = amount/12)
      const hostingMonthly = (hostingClients ?? []).map((h: Record<string, unknown>) => ({
        description: h.description,
        client: h.client,
        monthly_amount: h.cycle === 'yearly' ? Math.round((h.amount as number) / 12 * 100) / 100 : h.amount,
        cycle: h.cycle,
      }))
      const hostingTotal = hostingMonthly.reduce((sum: number, h: Record<string, unknown>) => sum + (h.monthly_amount as number), 0)

      // 3. Active maintenance retainers
      const { data: maintenances } = await supabase
        .from('maintenances')
        .select('id, monthly_retainer, project_pn, client:clients(name)')
        .eq('status', 'active')

      const maintenanceTotal = (maintenances ?? []).reduce((sum: number, m: Record<string, unknown>) => sum + (m.monthly_retainer as number), 0)

      // 4. Planner totals by status
      const plannerByStatus: Record<string, number> = {}
      for (const e of (plannerEntries ?? [])) {
        const s = e.status as string
        const amt = (e.actual_amount ?? e.planned_amount) as number
        plannerByStatus[s] = (plannerByStatus[s] ?? 0) + amt
      }

      return {
        result: {
          month: targetMonth,
          planner_entries: plannerEntries ?? [],
          planner_totals_by_status: plannerByStatus,
          hosting_clients: hostingMonthly,
          hosting_total_monthly: hostingTotal,
          maintenance_retainers: maintenances ?? [],
          maintenance_total_monthly: maintenanceTotal,
          grand_total: Object.values(plannerByStatus).reduce((s, v) => s + v, 0) + hostingTotal + maintenanceTotal,
        },
      }
    }

    case 'get_client_overview': {
      // Find client
      const { data: clients, error: clientErr } = await supabase
        .from('clients')
        .select('id, name, email, phone')
        .ilike('name', `%${input.client_name}%`)
        .limit(1)
      if (clientErr || !clients?.length) return { result: { error: `Client "${input.client_name}" not found` } }
      const client = clients[0]

      // Active projects
      const { data: projects } = await supabase
        .from('projects')
        .select('pn, name, type, status, contract_value, currency, start_date, end_date')
        .eq('client_id', client.id)
        .order('status')

      // Maintenance contracts
      const { data: maintenances } = await supabase
        .from('maintenances')
        .select('id, monthly_retainer, status, project_pn')
        .eq('client_id', client.id)

      // Hosting clients
      const { data: hosting } = await supabase
        .from('hosting_clients')
        .select('id, description, amount, cycle, status, billing_since')
        .eq('client_id', client.id)

      // Domains
      const { data: domains } = await supabase
        .from('domains')
        .select('domain_name, expiry_date, yearly_amount, archived')
        .eq('client_id', client.id)
        .eq('archived', false)

      const activeProjects = (projects ?? []).filter((p: Record<string, unknown>) => p.status === 'active')
      const activeMaintenance = (maintenances ?? []).filter((m: Record<string, unknown>) => m.status === 'active')
      const activeHosting = (hosting ?? []).filter((h: Record<string, unknown>) => h.status === 'active')

      const maintenanceMonthly = activeMaintenance.reduce((s: number, m: Record<string, unknown>) => s + (m.monthly_retainer as number), 0)
      const hostingMonthly = activeHosting.reduce((s: number, h: Record<string, unknown>) => {
        const amt = h.amount as number
        return s + (h.cycle === 'yearly' ? Math.round(amt / 12 * 100) / 100 : amt)
      }, 0)
      const totalMonthlyRecurring = maintenanceMonthly + hostingMonthly

      return {
        result: {
          client,
          active_projects: activeProjects,
          all_projects: projects ?? [],
          maintenance_contracts: maintenances ?? [],
          hosting_clients: hosting ?? [],
          domains: domains ?? [],
          summary: {
            maintenance_monthly_retainer: maintenanceMonthly,
            hosting_monthly: hostingMonthly,
            total_monthly_recurring: totalMonthlyRecurring,
            total_monthly_recurring_annual: Math.round(totalMonthlyRecurring * 12 * 100) / 100,
          },
        },
      }
    }

    case 'list_pipeline': {
      let q = supabase
        .from('pipeline')
        .select('id, title, company_name, estimated_amount, probability, status, expected_month, deal_type, client:clients(name)')
        .order('expected_month')
      const filterStatus = (input.status as string) || 'active'
      if (filterStatus !== 'all') q = q.not('status', 'in', '("won","lost")')
      const { data, error } = await q
      if (error) return { result: { error: error.message } }
      return { result: data }
    }

    default:
      return { result: { error: `Unknown tool: ${name}` } }
  }
}

// Execute a confirmed status update (called after user taps ✅)
export async function executeStatusUpdate(
  supabase: SupabaseClient,
  planId: string,
  newStatus: string,
  actualAmount?: number
) {
  const updates: Record<string, unknown> = { status: newStatus }
  if (actualAmount !== undefined) updates.actual_amount = actualAmount
  if (newStatus === 'issued') updates.actual_amount = actualAmount ?? undefined

  const { data, error } = await supabase
    .from('revenue_planner')
    .update(updates)
    .eq('id', planId)
    .select('*, project:projects(pn, name, client:clients(name))')
    .single()

  if (error) throw new Error(error.message)
  return data
}
