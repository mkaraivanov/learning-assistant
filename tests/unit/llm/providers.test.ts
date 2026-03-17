import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockAnthropicCreate, mockChatCreate, mockEmbeddingsCreate } = vi.hoisted(() => ({
  mockAnthropicCreate: vi.fn(),
  mockChatCreate: vi.fn(),
  mockEmbeddingsCreate: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function (this: Record<string, unknown>) {
    this.messages = { create: mockAnthropicCreate }
  }),
}))

vi.mock('openai', () => ({
  default: vi.fn(function (this: Record<string, unknown>) {
    this.chat = { completions: { create: mockChatCreate } }
    this.embeddings = { create: mockEmbeddingsCreate }
  }),
}))

import { ClaudeProvider } from '@/lib/llm/claude'
import { OpenAILLMProvider, OpenAIEmbeddingProvider } from '@/lib/llm/openai'

const validSummaryJson = JSON.stringify({
  summary_short: 'Test summary.',
  summary_bullets: ['Point A', 'Point B'],
  tags: ['test'],
})

describe('ClaudeProvider', () => {
  beforeEach(() => mockAnthropicCreate.mockClear())

  it('calls the Anthropic messages API', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: validSummaryJson }],
    })
    await new ClaudeProvider().summarize('Some content')
    expect(mockAnthropicCreate).toHaveBeenCalledOnce()
    const call = mockAnthropicCreate.mock.calls[0][0]
    expect(call.model).toBe('claude-sonnet-4-6')
    expect(call.messages[0].role).toBe('user')
  })

  it('returns parsed summary', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: validSummaryJson }],
    })
    const result = await new ClaudeProvider().summarize('content')
    expect(result.summary_short).toBe('Test summary.')
    expect(result.tags).toEqual(['test'])
  })

  it('throws when response type is not text', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'tool_use', id: 'x', name: 'fn', input: {} }],
    })
    await expect(new ClaudeProvider().summarize('content')).rejects.toThrow(
      'Unexpected response type from Claude'
    )
  })
})

describe('OpenAILLMProvider', () => {
  beforeEach(() => mockChatCreate.mockClear())

  it('calls the OpenAI chat completions API', async () => {
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: validSummaryJson } }],
    })
    await new OpenAILLMProvider().summarize('content')
    expect(mockChatCreate).toHaveBeenCalledOnce()
    const call = mockChatCreate.mock.calls[0][0]
    expect(call.model).toBe('gpt-4o-mini')
    expect(call.response_format).toEqual({ type: 'json_object' })
  })

  it('returns parsed summary', async () => {
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: validSummaryJson } }],
    })
    const result = await new OpenAILLMProvider().summarize('content')
    expect(result.summary_bullets).toEqual(['Point A', 'Point B'])
  })

  it('throws when response content is empty', async () => {
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: null } }],
    })
    await expect(new OpenAILLMProvider().summarize('content')).rejects.toThrow(
      'Empty response from OpenAI'
    )
  })
})

describe('OpenAIEmbeddingProvider', () => {
  beforeEach(() => mockEmbeddingsCreate.mockClear())

  it('calls the OpenAI embeddings API', async () => {
    mockEmbeddingsCreate.mockResolvedValue({
      data: [{ embedding: new Array(1536).fill(0.5) }],
    })
    await new OpenAIEmbeddingProvider().embed('hello')
    expect(mockEmbeddingsCreate).toHaveBeenCalledOnce()
    const call = mockEmbeddingsCreate.mock.calls[0][0]
    expect(call.model).toBe('text-embedding-3-small')
  })

  it('truncates input to 8000 chars', async () => {
    mockEmbeddingsCreate.mockResolvedValue({
      data: [{ embedding: new Array(1536).fill(0.1) }],
    })
    await new OpenAIEmbeddingProvider().embed('z'.repeat(10_000))
    const input = mockEmbeddingsCreate.mock.calls[0][0].input as string
    expect(input.length).toBe(8000)
  })

  it('returns the embedding array', async () => {
    const embedding = new Array(1536).fill(0.42)
    mockEmbeddingsCreate.mockResolvedValue({ data: [{ embedding }] })
    const result = await new OpenAIEmbeddingProvider().embed('text')
    expect(result).toEqual(embedding)
  })
})
