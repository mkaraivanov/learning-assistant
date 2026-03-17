import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock LLM providers before importing the module under test
vi.mock('@/lib/llm', () => ({
  getLLMProvider: vi.fn(),
  getEmbeddingProvider: vi.fn(),
}))

import { summarizeContent, embedContent } from '@/lib/pipeline/summarize'
import { getLLMProvider, getEmbeddingProvider } from '@/lib/llm'

const mockSummary = {
  summary_short: 'A concise summary.',
  summary_bullets: ['Bullet one', 'Bullet two'],
  tags: ['tag-a', 'tag-b'],
}

const mockSummarize = vi.fn().mockResolvedValue(mockSummary)
const mockEmbed = vi.fn().mockResolvedValue(new Array(1536).fill(0.1))

beforeEach(() => {
  vi.mocked(getLLMProvider).mockReturnValue({ summarize: mockSummarize })
  vi.mocked(getEmbeddingProvider).mockReturnValue({ embed: mockEmbed })
  mockSummarize.mockClear()
  mockEmbed.mockClear()
})

describe('summarizeContent', () => {
  it('calls llm.summarize for short content', async () => {
    const result = await summarizeContent('Short text.')
    expect(mockSummarize).toHaveBeenCalledOnce()
    expect(mockSummarize).toHaveBeenCalledWith('Short text.')
    expect(result).toEqual(mockSummary)
  })

  it('returns the summary from the provider', async () => {
    const result = await summarizeContent('hello world')
    expect(result.summary_short).toBe('A concise summary.')
    expect(result.tags).toEqual(['tag-a', 'tag-b'])
  })

  it('uses map-reduce for content over 100k chars', async () => {
    const longText = 'x'.repeat(110_000)
    await summarizeContent(longText)
    // Map pass: multiple chunks + 1 reduce call = more than 1 call
    expect(mockSummarize.mock.calls.length).toBeGreaterThan(1)
    // The final reduce call combines chunk summaries
    const lastCall = mockSummarize.mock.calls.at(-1)![0] as string
    expect(lastCall).toContain('summaries of different sections')
  })
})

describe('embedContent', () => {
  it('calls embedder.embed with the text', async () => {
    await embedContent('some text to embed')
    expect(mockEmbed).toHaveBeenCalledOnce()
    expect(mockEmbed).toHaveBeenCalledWith('some text to embed')
  })

  it('truncates text to 8000 chars before embedding', async () => {
    const longText = 'a'.repeat(10_000)
    await embedContent(longText)
    const embeddedText = mockEmbed.mock.calls[0][0] as string
    expect(embeddedText.length).toBe(8000)
  })

  it('returns the embedding array', async () => {
    const result = await embedContent('text')
    expect(result).toHaveLength(1536)
  })
})
