import type { Summary, SummarizeOptions } from '@/types/item'

export interface LLMProvider {
  summarize(text: string, opts?: SummarizeOptions): Promise<Summary>
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>
}
