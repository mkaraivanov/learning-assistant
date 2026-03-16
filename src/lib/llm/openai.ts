import OpenAI from 'openai'
import type { LLMProvider, EmbeddingProvider } from './types'
import type { Summary, SummarizeOptions } from '@/types/item'
import { SUMMARIZE_PROMPT } from './prompts'
import { parseSummaryResponse } from './parse-summary'

export class OpenAILLMProvider implements LLMProvider {
  private client: OpenAI

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }

  async summarize(text: string, _opts?: SummarizeOptions): Promise<Summary> {
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SUMMARIZE_PROMPT },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0].message.content
    if (!content) throw new Error('Empty response from OpenAI')
    return parseSummaryResponse(content)
  }
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private client: OpenAI

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000), // ~2000 tokens max for embedding
    })
    return response.data[0].embedding
  }
}
