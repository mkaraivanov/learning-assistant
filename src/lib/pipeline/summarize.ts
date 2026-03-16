import { getLLMProvider, getEmbeddingProvider } from '@/lib/llm'
import type { Summary } from '@/types/item'

const SHORT_CONTENT_LIMIT = 100_000 // chars

function chunkText(text: string, chunkSize: number, overlapPct = 0.1): string[] {
  const overlap = Math.floor(chunkSize * overlapPct)
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    chunks.push(text.slice(start, end))
    if (end === text.length) break
    start = end - overlap
  }

  return chunks
}

async function summarizeChunk(text: string): Promise<string> {
  const llm = getLLMProvider()
  const result = await llm.summarize(text)
  return result.summary_short + '\n' + result.summary_bullets.join('\n')
}

export async function summarizeContent(text: string): Promise<Summary> {
  const llm = getLLMProvider()

  if (text.length < SHORT_CONTENT_LIMIT) {
    // Single-shot summarization
    return llm.summarize(text)
  }

  // Map-reduce for long content
  const chunks = chunkText(text, 80_000, 0.1)
  const chunkSummaries = await Promise.all(chunks.map(summarizeChunk))
  const combined = chunkSummaries.join('\n\n---\n\n')

  // Final reduce pass
  return llm.summarize(
    `The following are summaries of different sections of a longer document. Create a unified summary:\n\n${combined}`
  )
}

export async function embedContent(text: string): Promise<number[]> {
  const embedder = getEmbeddingProvider()
  // Use summary or first 8000 chars for embedding
  return embedder.embed(text.slice(0, 8000))
}
