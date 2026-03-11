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
