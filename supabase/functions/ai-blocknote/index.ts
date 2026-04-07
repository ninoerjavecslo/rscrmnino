import { anthropic } from 'npm:@ai-sdk/anthropic'
import { streamText, convertToModelMessages } from 'npm:ai'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  const { messages, toolDefinitions } = await req.json()

  // Convert BlockNote's message format and forward tool definitions to the model
  // toolDefinitions come from BlockNote and define document-editing tools (add_blocks, update_block, etc.)
  const tools = toolDefinitions
    ? Object.fromEntries(
        toolDefinitions.map((t: { name: string; description: string; parameters: unknown }) => [
          t.name,
          {
            description: t.description,
            parameters: t.parameters,
          },
        ])
      )
    : undefined

  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: 'You are a helpful writing assistant for a Slovenian web agency. Help improve, expand, shorten, or rewrite content for client offers. Be professional and concise. When editing document content, use the provided tools.',
    messages: convertToModelMessages(messages),
    tools,
    toolChoice: tools ? 'required' : undefined,
    maxTokens: 1024,
  })

  return result.toUIMessageStreamResponse({ headers: CORS })
})
