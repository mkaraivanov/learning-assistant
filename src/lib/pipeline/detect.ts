import type { SourceType } from '@/types/item'

const YOUTUBE_PATTERNS = [
  /youtube\.com\/watch/,
  /youtu\.be\//,
  /youtube\.com\/shorts\//,
  /youtube\.com\/embed\//,
]

const PODCAST_PATTERNS = [
  /\.(mp3|mp4|m4a|ogg|wav|aac|opus)(\?.*)?$/i,
  /feeds\./,
  /feed\./,
  /rss\./,
  /podcasts\.apple\.com/,
  /anchor\.fm/,
  /spotify\.com\/episode/,
  /buzzsprout\.com/,
  /simplecast\.com/,
]

export function detectSourceType(url: string): SourceType {
  const normalized = url.toLowerCase()

  if (YOUTUBE_PATTERNS.some((p) => p.test(normalized))) return 'youtube'
  if (PODCAST_PATTERNS.some((p) => p.test(normalized))) return 'podcast'
  return 'article'
}
