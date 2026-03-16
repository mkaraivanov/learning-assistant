export type SourceType = 'article' | 'youtube' | 'podcast'
export type ItemStatus = 'pending' | 'processing' | 'ready' | 'failed'

export interface Item {
  id: string
  user_id: string | null
  source_type: SourceType
  source_url: string
  status: ItemStatus

  title: string | null
  author: string | null
  channel: string | null
  published_at: string | null
  thumbnail_url: string | null
  duration_secs: number | null

  raw_content: string | null
  summary_short: string | null
  summary_bullets: string[] | null
  tags: string[] | null

  embedding: number[] | null
  error_message: string | null
  transcription_job_id: string | null

  created_at: string
  updated_at: string
}

export type ItemInsert = Omit<Item, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  created_at?: string
  updated_at?: string
}

export type ItemUpdate = Partial<ItemInsert>

export interface Summary {
  summary_short: string
  summary_bullets: string[]
  tags: string[]
}

export interface SummarizeOptions {
  maxTokens?: number
}
