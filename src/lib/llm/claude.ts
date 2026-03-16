import Anthropic from '@anthropic-ai/sdk'
import type { LLMProvider } from './types'
import type { Summary, SummarizeOptions } from '@/types/item'
import { SUMMARIZE_PROMPT } from './prompts'
import { parseSummaryResponse } from './parse-summary'

export class ClaudeProvider implements LLMProvider {
  private client: Anthropic

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }

  async summarize(text: string, _opts?: SummarizeOptions): Promise<Summary> {
    const message = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `${SUMMARIZE_PROMPT}\n\n---\n\n${text}`,
        },
      ],
    })

    const content = message.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type from Claude')

    return parseSummaryResponse(content.text)
  }
}
