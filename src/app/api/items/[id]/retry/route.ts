import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { processArticle } from '@/lib/pipeline/article'
import { processYouTube } from '@/lib/pipeline/youtube'
import { submitPodcastForTranscription } from '@/lib/pipeline/podcast'

const MAX_RETRIES = 3

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireAuth(request)
  if (authError) return authError

  const { id } = await params
  const supabase = createAdminClient()

  const { data: item } = await supabase
    .from('items')
    .select('id, source_url, source_type, status, retry_count')
    .eq('id', id)
    .single()

  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }

  if (item.status !== 'failed') {
    return NextResponse.json({ error: 'Only failed items can be retried' }, { status: 400 })
  }

  if (item.retry_count >= MAX_RETRIES) {
    return NextResponse.json({ error: `Max retries (${MAX_RETRIES}) exceeded` }, { status: 400 })
  }

  await supabase.from('items').update({
    status: 'pending',
    error_message: null,
    retry_count: item.retry_count + 1,
  }).eq('id', id)

  logger.info('Retry triggered', { itemId: id, attempt: item.retry_count + 1 })

  after(async () => {
    await supabase.from('items').update({ status: 'processing' }).eq('id', id)

    try {
      const sourceType = item.source_type as 'article' | 'youtube' | 'podcast'

      if (sourceType === 'podcast') {
        const { transcription_job_id, title, author } = await submitPodcastForTranscription(item.source_url)
        await supabase.from('items').update({ transcription_job_id, title, author, status: 'processing' }).eq('id', id)
      } else {
        const data = sourceType === 'article'
          ? await processArticle(item.source_url)
          : await processYouTube(item.source_url)
        await supabase.from('items').update({ ...data, status: 'ready' }).eq('id', id)
      }

      logger.info('Retry succeeded', { itemId: id })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      logger.error('Retry failed', { itemId: id, error: message })
      await supabase.from('items').update({ status: 'failed', error_message: message }).eq('id', id)
    }
  })

  return NextResponse.json({ ok: true, retry_count: item.retry_count + 1 })
}
