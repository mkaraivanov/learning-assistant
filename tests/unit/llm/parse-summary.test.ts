import { describe, it, expect } from 'vitest'
import { parseSummaryResponse } from '@/lib/llm/parse-summary'

const validSummary = {
  summary_short: 'A short summary.',
  summary_bullets: ['Point one', 'Point two'],
  tags: ['tech', 'ai'],
}

describe('parseSummaryResponse', () => {
  describe('valid responses', () => {
    it('parses a clean JSON string', () => {
      const result = parseSummaryResponse(JSON.stringify(validSummary))
      expect(result.summary_short).toBe('A short summary.')
      expect(result.summary_bullets).toEqual(['Point one', 'Point two'])
      expect(result.tags).toEqual(['tech', 'ai'])
    })

    it('strips markdown json code fences', () => {
      const fenced = '```json\n' + JSON.stringify(validSummary) + '\n```'
      const result = parseSummaryResponse(fenced)
      expect(result.summary_short).toBe('A short summary.')
    })

    it('strips plain code fences', () => {
      const fenced = '```\n' + JSON.stringify(validSummary) + '\n```'
      const result = parseSummaryResponse(fenced)
      expect(result.summary_short).toBe('A short summary.')
    })

    it('handles extra whitespace around the JSON', () => {
      const result = parseSummaryResponse('  \n' + JSON.stringify(validSummary) + '\n  ')
      expect(result.tags).toEqual(['tech', 'ai'])
    })
  })

  describe('invalid responses', () => {
    it('throws on non-JSON text', () => {
      expect(() => parseSummaryResponse('This is just plain text.')).toThrow(
        'LLM returned invalid JSON'
      )
    })

    it('throws when summary_short is missing', () => {
      const bad = { summary_bullets: ['a'], tags: ['b'] }
      expect(() => parseSummaryResponse(JSON.stringify(bad))).toThrow(
        'LLM response missing required fields'
      )
    })

    it('throws when summary_bullets is not an array', () => {
      const bad = { summary_short: 'ok', summary_bullets: 'not-array', tags: ['b'] }
      expect(() => parseSummaryResponse(JSON.stringify(bad))).toThrow(
        'LLM response missing required fields'
      )
    })

    it('throws when tags is not an array', () => {
      const bad = { summary_short: 'ok', summary_bullets: ['a'], tags: 'not-array' }
      expect(() => parseSummaryResponse(JSON.stringify(bad))).toThrow(
        'LLM response missing required fields'
      )
    })

    it('throws on null JSON', () => {
      expect(() => parseSummaryResponse('null')).toThrow()
    })

    it('includes a snippet of the raw response in the error', () => {
      expect(() => parseSummaryResponse('bad input')).toThrow('bad input')
    })
  })
})
