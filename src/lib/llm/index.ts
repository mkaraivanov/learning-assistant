import type { LLMProvider, EmbeddingProvider } from './types'
import { ClaudeProvider } from './claude'
import { OpenAILLMProvider, OpenAIEmbeddingProvider } from './openai'

let llmProvider: LLMProvider | null = null
let embeddingProvider: EmbeddingProvider | null = null

export function getLLMProvider(): LLMProvider {
  if (!llmProvider) {
    const provider = process.env.LLM_PROVIDER ?? 'claude'
    llmProvider = provider === 'openai' ? new OpenAILLMProvider() : new ClaudeProvider()
  }
  return llmProvider
}

export function getEmbeddingProvider(): EmbeddingProvider {
  if (!embeddingProvider) {
    embeddingProvider = new OpenAIEmbeddingProvider()
  }
  return embeddingProvider
}

export type { LLMProvider, EmbeddingProvider }
