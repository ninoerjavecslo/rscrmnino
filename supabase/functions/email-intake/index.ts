// supabase/functions/email-intake/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const INTAKE_SECRET = Deno.env.get('EMAIL_INTAKE_SECRET') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

async function fetchEmailBody(emailId: string): Promise<{ text: string; html: string }> {
  if (!emailId || !RESEND_API_KEY) return { text: '', html: '' }
  const res = await fetch(`https://api.resend.com/emails/${emailId}`, {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  })
  if (!res.ok) return { text: '', html: '' }
  const data = await res.json()
  return { text: data.text ?? '', html: data.html ?? '' }
}

async function generateBugReport(subject: string, emailBody: string, fromEmail: string): Promise<{ summary: string; description: string }> {
  if (!ANTHROPIC_API_KEY || !emailBody) {
    return { summary: subject, description: emailBody || '(no body)' }
  }

  const prompt = `You are a technical project manager. A client sent an email reporting a bug or issue. Convert it into a clean, structured Jira bug report.

Email from: ${fromEmail}
Subject: ${subject}
Body:
${emailBody}

Write a JSON response with exactly these two fields:
- "summary": a concise one-line bug title (max 100 chars)
- "description": a structured bug report with sections: **What happened**, **Steps to reproduce** (if inferable), **Expected behavior**, **Original message**

Keep it professional and technical. Respond with only valid JSON, no markdown wrapper.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) return { summary: subject, description: emailBody }

  const data = await res.json()
  const text = data.content?.[0]?.text ?? ''
  try {
    const parsed = JSON.parse(text)
    return { summary: parsed.summary ?? subject, description: parsed.description ?? emailBody }
  } catch {
    return { summary: subject, description: emailBody }
  }
}

Deno.serve(async (req) => {
  const secret = req.headers.get('x-intake-secret') ?? new URL(req.url).searchParams.get('secret')
  if (INTAKE_SECRET && secret !== INTAKE_SECRET) {
    return new Response('Forbidden', { status: 403 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const body = await req.json()
  const payload = body.data ?? body

  console.log('RAW PAYLOAD KEYS:', JSON.stringify(Object.keys(payload)))
  console.log('RAW BODY KEYS:', JSON.stringify(Object.keys(body)))
  console.log('payload.text:', payload.text?.slice?.(0, 200))
  console.log('payload.html:', payload.html?.slice?.(0, 200))
  console.log('payload.email_id:', payload.email_id)

  const fromFull: string = payload.from ?? payload.From ?? ''
  const subject: string  = payload.subject ?? payload.Subject ?? '(no subject)'
  const emailId: string  = payload.email_id ?? ''
  const toList: string[] = Array.isArray(payload.to) ? payload.to : (payload.to ? [payload.to] : [])
  const toFull: string   = toList.join(' ').toLowerCase()

  // Fetch full email body from Resend
  let textBody = payload.text ?? payload.TextBody ?? payload.plain ?? ''
  let htmlBody = payload.html ?? payload.HtmlBody ?? ''
  if (!textBody && !htmlBody && emailId) {
    const fetched = await fetchEmailBody(emailId)
    textBody = fetched.text
    htmlBody = fetched.html
  }

  const emailBody = textBody || htmlBody

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

  type Rule = typeof rules[0]
  let matched: Rule | null = null

  // 1. To-address match (e.g. unichem@melafi.resend.app → keyword "unichem")
  if (toFull) {
    matched = rules.find((r: Rule) => r.keyword && toFull.includes(r.keyword.toLowerCase())) ?? null
  }
  // 2. Sender domain match
  if (!matched && senderDomain) {
    matched = rules.find((r: Rule) => r.sender_domain && senderDomain.endsWith(r.sender_domain.toLowerCase())) ?? null
  }
  // 3. Keyword fallback in subject+body
  if (!matched) {
    matched = rules.find((r: Rule) => r.keyword && (subject + ' ' + emailBody).toLowerCase().includes(r.keyword.toLowerCase())) ?? null
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

  // Generate AI bug report
  const { summary, description } = await generateBugReport(subject, emailBody, fromFull)

  const authBasic = btoa(`${jiraEmail}:${jiraToken}`)

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

  // Build Jira ADF description with formatted paragraphs
  const descParagraphs = description.split('\n').filter(l => l.trim()).map(line => ({
    type: 'paragraph',
    content: [{ type: 'text', text: line }],
  }))

  const createRes = await fetch(`${jiraBase}/rest/api/3/issue`, {
    method: 'POST',
    headers: { Authorization: `Basic ${authBasic}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      fields: {
        project: { key: jiraProjectKey },
        summary,
        description: {
          type: 'doc',
          version: 1,
          content: descParagraphs.length > 0 ? descParagraphs : [{
            type: 'paragraph',
            content: [{ type: 'text', text: '(no body)' }],
          }],
        },
        issuetype: { id: issueType.id },
        labels: [((maintenance.client as Record<string, unknown>)?.name as string ?? 'email-intake').replace(/\s+/g, '-')],
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
