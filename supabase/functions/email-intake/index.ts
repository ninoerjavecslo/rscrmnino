// supabase/functions/email-intake/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const INTAKE_SECRET = Deno.env.get('EMAIL_INTAKE_SECRET') ?? ''

Deno.serve(async (req) => {
  // Optional shared secret for webhook security
  const secret = req.headers.get('x-intake-secret') ?? new URL(req.url).searchParams.get('secret')
  if (INTAKE_SECRET && secret !== INTAKE_SECRET) {
    return new Response('Forbidden', { status: 403 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Parse inbound email payload (Postmark/Resend format)
  const body = await req.json()
  const fromFull: string  = body.From ?? body.from ?? ''
  const subject: string   = body.Subject ?? body.subject ?? '(no subject)'
  const textBody: string  = body.TextBody ?? body.text ?? body.plain ?? ''
  const htmlBody: string  = body.HtmlBody ?? body.html ?? ''

  // Extract sender domain
  const emailMatch = fromFull.match(/@([\w.-]+)/)
  const senderDomain = emailMatch ? emailMatch[1].toLowerCase() : ''

  // Load all intake rules
  const { data: rules } = await supabase
    .from('email_intake_rules')
    .select('*, maintenance:maintenances(id, name, jira_project_key, client:clients(name))')

  if (!rules || rules.length === 0) {
    return new Response(JSON.stringify({ error: 'No intake rules configured' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Match: domain first, then keyword in subject+body
  const combined = (subject + ' ' + textBody + ' ' + htmlBody).toLowerCase()
  type Rule = typeof rules[0]
  let matched: Rule | null = null

  // 1. Domain match
  if (senderDomain) {
    matched = rules.find((r: Rule) => r.sender_domain && senderDomain.endsWith(r.sender_domain.toLowerCase())) ?? null
  }
  // 2. Keyword fallback
  if (!matched) {
    matched = rules.find((r: Rule) => r.keyword && combined.includes(r.keyword.toLowerCase())) ?? null
  }

  if (!matched) {
    return new Response(JSON.stringify({ error: `No rule matched for sender: ${fromFull}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const maintenance = matched.maintenance as Record<string, unknown>
  const jiraProjectKey = maintenance.jira_project_key as string | null
  if (!jiraProjectKey) {
    return new Response(JSON.stringify({ error: 'Matched maintenance has no Jira project key' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Load Jira credentials
  const { data: settingsRows } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['jira_base_url', 'jira_user_email', 'jira_api_token'])

  const settings = Object.fromEntries(
    (settingsRows ?? []).map((r: { key: string; value: string }) => [r.key, r.value])
  )

  const jiraBase  = settings['jira_base_url']
  const jiraEmail = settings['jira_user_email']
  const jiraToken = settings['jira_api_token']

  if (!jiraBase || !jiraEmail || !jiraToken) {
    return new Response(JSON.stringify({ error: 'Jira credentials not configured' }), { status: 200 })
  }

  const authBasic = btoa(`${jiraEmail}:${jiraToken}`)

  // Resolve issue type ID for this project
  const metaRes = await fetch(
    `${jiraBase}/rest/api/3/issue/createmeta/${jiraProjectKey}/issuetypes`,
    { headers: { Authorization: `Basic ${authBasic}`, Accept: 'application/json' } }
  )
  const metaData = await metaRes.json()
  const issueTypes = (metaData.issueTypes ?? metaData.values ?? []) as Array<{ id: string; name: string }>
  const issueType = issueTypes.find(t => t.name === matched!.default_issue_type) ?? issueTypes[0]

  if (!issueType) {
    return new Response(JSON.stringify({ error: 'Could not find issue type in Jira project' }), { status: 200 })
  }

  // Create Jira issue
  const createRes = await fetch(`${jiraBase}/rest/api/3/issue`, {
    method: 'POST',
    headers: { Authorization: `Basic ${authBasic}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      fields: {
        project: { key: jiraProjectKey },
        summary: subject,
        description: {
          type: 'doc',
          version: 1,
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: textBody || htmlBody || '(email body empty)' }]
          }]
        },
        issuetype: { id: issueType.id },
        labels: [(maintenance.client as Record<string, unknown>)?.name as string ?? 'email-intake'],
      }
    })
  })

  if (!createRes.ok) {
    const err = await createRes.text()
    return new Response(JSON.stringify({ error: `Jira create failed: ${err}` }), { status: 200 })
  }

  const created = await createRes.json()
  return new Response(JSON.stringify({ ok: true, issueKey: created.key }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
