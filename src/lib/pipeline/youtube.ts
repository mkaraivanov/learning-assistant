import { YoutubeTranscript } from 'youtube-transcript'
import type { ItemInsert } from '@/types/item'
import { summarizeContent, embedContent } from './summarize'

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

interface YouTubeMetadata {
  title: string
  channelTitle: string
  description: string
  publishedAt: string
  thumbnailUrl: string
  durationSecs: number | null
}

async function fetchYouTubeMetadata(videoId: string): Promise<YouTubeMetadata> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) throw new Error('YOUTUBE_API_KEY is not set')

  const url = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${apiKey}&part=snippet,contentDetails`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`YouTube API error: ${response.status}`)
  }

  const data = await response.json()
  const video = data.items?.[0]

  if (!video) throw new Error('Video not found')

  const snippet = video.snippet
  const duration = video.contentDetails?.duration ?? null

  // Parse ISO 8601 duration (PT1H2M3S) to seconds
  let durationSecs: number | null = null
  if (duration) {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    if (match) {
      const h = parseInt(match[1] ?? '0')
      const m = parseInt(match[2] ?? '0')
      const s = parseInt(match[3] ?? '0')
      durationSecs = h * 3600 + m * 60 + s
    }
  }

  return {
    title: snippet.title,
    channelTitle: snippet.channelTitle,
    description: snippet.description,
    publishedAt: snippet.publishedAt,
    thumbnailUrl: snippet.thumbnails?.high?.url ?? snippet.thumbnails?.default?.url ?? '',
    durationSecs,
  }
}

export async function processYouTube(url: string): Promise<Partial<ItemInsert>> {
  const videoId = extractVideoId(url)
  if (!videoId) throw new Error('Could not extract video ID from URL')

  const [metadata, transcriptItems] = await Promise.allSettled([
    fetchYouTubeMetadata(videoId),
    YoutubeTranscript.fetchTranscript(videoId),
  ])

  if (transcriptItems.status === 'rejected') {
    throw new Error('No transcript available for this video. Auto-captions may be disabled.')
  }

  const transcript = transcriptItems.value.map((t) => t.text).join(' ')

  if (!transcript || transcript.length < 100) {
    throw new Error('Transcript is empty or too short to summarize.')
  }

  const meta = metadata.status === 'fulfilled' ? metadata.value : null
  const rawContent = transcript
  const summary = await summarizeContent(rawContent)
  const embedding = await embedContent(summary.summary_short + ' ' + summary.summary_bullets.join(' '))

  return {
    title: meta?.title ?? null,
    channel: meta?.channelTitle ?? null,
    published_at: meta?.publishedAt ?? null,
    thumbnail_url: meta?.thumbnailUrl ?? null,
    duration_secs: meta?.durationSecs ?? null,
    raw_content: rawContent,
    summary_short: summary.summary_short,
    summary_bullets: summary.summary_bullets,
    tags: summary.tags,
    embedding,
  }
}
