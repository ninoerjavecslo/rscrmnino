import Anthropic from 'npm:@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

const BLOCK_SCHEMA = `
Custom BlockNote block types for Renderspace offers:

1. clientMeta — props: offerNumber, clientName, contactPerson, date (YYYY-MM-DD), validUntil (YYYY-MM-DD), introText
2. pricingTable — props: itemsJson (JSON array of {description, quantity, unit, unit_price, total}), discount (string number), paymentType ("one_time"|"monthly")
3. boilerplateBlock — props: title, body, collapsed ("true"|"false")
4. serviceBlock — props: title, collapsed ("false")
5. maintenancePackage — props: name, priceMonthly (string), featuresJson (JSON array of strings)
6. slaTable — props: responseTimeHours (string), uptimePct (string), includedHours (string), notes

Output a JSON array of block objects: [{type: "...", props: {...}}, ...]
`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } })
  }

  const { brief, projectType, contentLibrary, language, mode } = await req.json()

  const systemPrompt = `You are an offer generation assistant for Renderspace, a Slovenian web agency.
Generate structured offer content as a BlockNote block array.

${BLOCK_SCHEMA}

Content library for this project type:
${JSON.stringify(contentLibrary, null, 2)}

Rules:
- Use content library service descriptions as starting points, adapt to the brief
- Keep pricing realistic based on Renderspace's historical rates (€95/h typical)
- Output language: ${language === 'sl' ? 'Slovenian' : 'English'}
- Output ONLY valid JSON array, no explanation text`

  const userMessage = mode === 'format_data'
    ? `Format this raw offer data into BlockNote blocks:\n\n${brief}`
    : `Generate a ${projectType} offer from this brief:\n\n${brief}`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const content = message.content[0].type === 'text' ? message.content[0].text : ''

  // Extract JSON array from response — wrap in try/catch, AI output can be malformed
  let blocks: unknown[] = []
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (jsonMatch) blocks = JSON.parse(jsonMatch[0])
  } catch (e) {
    console.error('Failed to parse AI block output:', e)
    return new Response(JSON.stringify({ error: 'AI returned malformed JSON', raw: content }), {
      status: 422,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  return new Response(JSON.stringify({ blocks }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
})
