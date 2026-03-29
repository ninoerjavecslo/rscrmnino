import Anthropic from 'npm:@anthropic-ai/sdk'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { mode, brief, formData, language, sections, boilerplate } = await req.json()

    const client = new Anthropic()

    const systemPrompt = `You are a proposal writer for Renderspace, a Slovenian digital agency.
Write in ${language === 'sl' ? 'Slovenian' : 'English'} language.
Your writing style is: professional, direct, confident. No fluff. Clear value propositions.
You MUST return ONLY valid JSON — no markdown, no explanations, just the JSON object.

Renderspace rate card: Designer 70 EUR/h, Developer 70 EUR/h, PM 90 EUR/h.

Available boilerplate blocks (use these verbatim where appropriate):
${JSON.stringify(boilerplate)}

You must return a JSON object with this structure:
{
  "title": "offer title",
  "sections": [
    {
      "id": "uuid-string",
      "type": "intro|scope|pricing|...",
      "title": "Section title",
      "enabled": true,
      "order": 1,
      "blocks": [
        {
          "id": "uuid-string",
          "type": "paragraph|goal-list|phase-block|pricing-table|...",
          "content": "text or JSON string"
        }
      ]
    }
  ],
  "pricing_total": 0
}

Section types to include based on user's selection: ${sections.join(', ')}

For pricing-table blocks, content is JSON: {"rows":[{"label":"","qty":"","rate":"","total":""}],"grandTotal":""}
For phase-block, content is JSON: {"tag":"FAZA 1","title":"","deadline":"","items":[],"deliverables":[]}
For goal-list, content is newline-separated text.
For bullet-list, content is newline-separated text.
For paragraph, content is plain text.`

    const userMessage = mode === 'quick'
      ? `Create a complete offer from this brief:\n\n${brief}`
      : `Create a complete offer from this structured data:\n\n${JSON.stringify(formData)}`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const result = JSON.parse(jsonMatch[0])

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
