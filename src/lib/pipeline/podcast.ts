import Parser from 'rss-parser'
import { AssemblyAI } from 'assemblyai'
import type { ItemInsert } from '@/types/item'
import { summarizeContent, embedContent } from './summarize'

const parser = new Parser()

function isDirectAudioUrl(url: string): boolean {
  return /\.(mp3|mp4|m4a|ogg|wav|aac|opus)(\?.*)?$/i.test(url)
}

async function resolveAudioUrl(url: string): Promise<{ audioUrl: string; title?: string; author?: string }> {
  if (isDirectAudioUrl(url)) {
    return { audioUrl: url }
  }

  // Try as RSS feed
  try {
    const feed = await parser.parseURL(url)
    const episode = feed.items?.[0]

    if (!episode?.enclosure?.url) {
      throw new Error('No audio enclosure found in RSS feed')
    }

    return {
      audioUrl: episode.enclosure.url,
      title: episode.title ?? feed.title ?? undefined,
      author: feed.author ?? feed.title ?? undefined,
    }
  } catch {
    throw new Error('URL is neither a direct audio file nor a valid RSS feed with audio enclosures')
  }
}

export async function submitPodcastForTranscription(url: string): Promise<{
  transcription_job_id: string
  title: string | null
  author: string | null
}> {
  const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY! })
  const { audioUrl, title, author } = await resolveAudioUrl(url)

  const transcript = await client.transcripts.submit({
    audio_url: audioUrl,
    webhook_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/transcribe/callback`,
    webhook_auth_header_name: 'x-webhook-secret',
    webhook_auth_header_value: process.env.ASSEMBLYAI_WEBHOOK_SECRET!,
  })

  return {
    transcription_job_id: transcript.id,
    title: title ?? null,
    author: author ?? null,
  }
}

export async function processPodcastTranscript(
  transcriptId: string
): Promise<Partial<ItemInsert>> {
  const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY! })
  const transcript = await client.transcripts.get(transcriptId)

  if (transcript.status !== 'completed') {
    throw new Error(`Transcript not ready: status is ${transcript.status}`)
  }

  if (!transcript.text) {
    throw new Error('Transcript completed but text is empty')
  }

  const rawContent = transcript.text
  const summary = await summarizeContent(rawContent)
  const embedding = await embedContent(summary.summary_short + ' ' + summary.summary_bullets.join(' '))

  return {
    raw_content: rawContent,
    summary_short: summary.summary_short,
    summary_bullets: summary.summary_bullets,
    tags: summary.tags,
    embedding,
    duration_secs: transcript.audio_duration ? Math.round(transcript.audio_duration) : null,
  }
}
