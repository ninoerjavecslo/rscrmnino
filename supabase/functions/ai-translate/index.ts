import Anthropic from 'npm:@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

const TRANSLATE_SYSTEM = `You are a translator for a Slovenian web agency's client offers.
Translate the text content within the BlockNote block array provided.

Rules:
- Translate ONLY text content in props (title, body, description, name, introText, etc.)
- Do NOT translate: offerNumber, date, validUntil, numeric values, unit strings ("h", "kom"), currency
- Do NOT change: block type, prop names, JSON structure, IDs
- Keep technical terms consistent with the content library provided
- Output ONLY the translated JSON array, no explanation`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } })
  }

  const { blocks, targetLanguage, contentLibrary } = await req.json()

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: TRANSLATE_SYSTEM,
    messages: [{
      role: 'user',
      content: `Content library terminology reference:\n${JSON.stringify(contentLibrary)}\n\nTranslate to ${targetLanguage === 'en' ? 'English' : 'Slovenian'}:\n\n${JSON.stringify(blocks, null, 2)}`,
    }],
  })

  const content = message.content[0].type === 'text' ? message.content[0].text : ''
  let translatedBlocks = blocks
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (jsonMatch) translatedBlocks = JSON.parse(jsonMatch[0])
  } catch (e) {
    console.error('Translation parse failed, returning original blocks:', e)
  }

  return new Response(JSON.stringify({ blocks: translatedBlocks }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
})
