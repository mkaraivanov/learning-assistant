import type { Summary } from '@/types/item'

export function parseSummaryResponse(raw: string): Summary {
  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`LLM returned invalid JSON: ${raw.slice(0, 200)}`)
  }

  if (
    typeof parsed !== 'object' || parsed === null ||
    typeof (parsed as Record<string, unknown>).summary_short !== 'string' ||
    !Array.isArray((parsed as Record<string, unknown>).summary_bullets) ||
    !Array.isArray((parsed as Record<string, unknown>).tags)
  ) {
    throw new Error(`LLM response missing required fields: ${raw.slice(0, 200)}`)
  }

  return parsed as Summary
}
