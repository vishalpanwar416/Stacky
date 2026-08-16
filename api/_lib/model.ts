/**
 * The shared OpenRouter call.
 *
 * Extracted so the GitHub webhook and the interactive AI routes cannot drift on
 * model, token ceiling or cost accounting — the spend ledger is only meaningful
 * if every paid call reports through the same path.
 */

export const MODEL = 'deepseek/deepseek-v4-flash'
export const MAX_OUTPUT_TOKENS = 4000

export async function askModel(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  schema: unknown
): Promise<{ result: any; costUsd: number }> {
  const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://stackyy.vercel.app',
      'X-Title': 'Stacky',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_schema', json_schema: schema },
    }),
  })
  if (!upstream.ok) {
    const detail = await upstream.text()
    console.error('OpenRouter error', upstream.status, detail.slice(0, 500))
    throw new Error(`The model provider returned ${upstream.status}.`)
  }
  const payload = (await upstream.json()) as any
  const content = payload?.choices?.[0]?.message?.content
  if (!content) throw new Error('The model returned an empty response.')
  // OpenRouter reports the real cost of the call; the ledger uses it rather
  // than estimating from token counts and a price table.
  return { result: JSON.parse(content), costUsd: Number(payload?.usage?.cost ?? 0) }
}
