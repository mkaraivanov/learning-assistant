import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { detectSourceType } from '@/lib/pipeline/detect'
import { validateExternalUrl } from '@/lib/pipeline/validate-url'
import { processArticle } from '@/lib/pipeline/article'
import { processYouTube } from '@/lib/pipeline/youtube'
import { submitPodcastForTranscription } from '@/lib/pipeline/podcast'
import { requireAuth } from '@/lib/auth'
import { logger } from '@/lib/logger'
import type { ItemInsert } from '@/types/item'

export async function POST(request: NextRequest) {
  const authError = requireAuth(request)
  if (authError) return authError

  const body = await request.json()
  const { url } = body

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }

  // Validate URL: parse, check scheme, block private networks
  let parsedUrl: URL
  try {
    parsedUrl = validateExternalUrl(url)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid URL' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  // Rate limit: max 10 items per 5 minutes
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('items')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', fiveMinutesAgo)

  if (count !== null && count >= 10) {
    return NextResponse.json({ error: 'Rate limit: max 10 items per 5 minutes' }, { status: 429 })
  }

  // Duplicate check: return existing item if URL already submitted
  const { data: existing } = await supabase
    .from('items')
    .select('id, status')
    .eq('source_url', parsedUrl.href)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ id: existing.id, status: existing.status, duplicate: true })
  }

  const sourceType = detectSourceType(parsedUrl.href)

  // Create item with pending status
  const { data: item, error: insertError } = await supabase
    .from('items')
    .insert({
      source_url: parsedUrl.href,
      source_type: sourceType,
      status: 'pending',
    } satisfies Partial<ItemInsert>)
    .select()
    .single()

  if (insertError || !item) {
    logger.error('Failed to create item', { url: parsedUrl.href, error: insertError?.message })
    return NextResponse.json({ error: 'Failed to create item' }, { status: 500 })
  }

  logger.info('Item created', { itemId: item.id, sourceType })

  // Use after() to run processing reliably after the response is sent.
  // This keeps the serverless function alive until processing completes.
  after(async () => {
    if (sourceType === 'podcast') {
      await processPodcastAsync(item.id, parsedUrl.href)
    } else {
      await processInlineAsync(item.id, parsedUrl.href, sourceType)
    }
  })

  return NextResponse.json({ id: item.id, status: item.status }, { status: 201 })
}

export async function GET(request: NextRequest) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)

  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = parseInt(searchParams.get('limit') ?? '20')
  const tag = searchParams.get('tag')
  const offset = (page - 1) * limit

  let query = supabase
    .from('items')
    .select('id, source_type, source_url, status, title, author, channel, thumbnail_url, summary_short, tags, created_at, updated_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (tag) {
    query = query.contains('tags', [tag])
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 })
  }

  return NextResponse.json({
    items: data,
    total: count,
    page,
    limit,
  })
}

async function processInlineAsync(itemId: string, url: string, sourceType: 'article' | 'youtube') {
  const supabase = createAdminClient()

  await supabase.from('items').update({ status: 'processing' }).eq('id', itemId)
  logger.info('Processing started', { itemId, sourceType })

  try {
    const data =
      sourceType === 'article'
        ? await processArticle(url)
        : await processYouTube(url)

    await supabase
      .from('items')
      .update({ ...data, status: 'ready' })
      .eq('id', itemId)

    logger.info('Processing completed', { itemId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error('Processing failed', { itemId, error: message })
    await supabase
      .from('items')
      .update({ status: 'failed', error_message: message })
      .eq('id', itemId)
  }
}

async function processPodcastAsync(itemId: string, url: string) {
  const supabase = createAdminClient()

  await supabase.from('items').update({ status: 'processing' }).eq('id', itemId)
  logger.info('Podcast submission started', { itemId })

  try {
    const { transcription_job_id, title, author } = await submitPodcastForTranscription(url)

    await supabase.from('items').update({
      transcription_job_id,
      title,
      author,
      status: 'processing',
    }).eq('id', itemId)

    logger.info('Podcast submitted to AssemblyAI', { itemId, transcription_job_id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error('Podcast submission failed', { itemId, error: message })
    await supabase
      .from('items')
      .update({ status: 'failed', error_message: message })
      .eq('id', itemId)
  }
}
