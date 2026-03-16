import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processPodcastTranscript } from '@/lib/pipeline/podcast'

export async function POST(request: NextRequest) {
  // Validate webhook secret
  const secret = request.headers.get('x-webhook-secret')
  if (secret !== process.env.ASSEMBLYAI_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { transcript_id, status } = body

  if (!transcript_id) {
    return NextResponse.json({ error: 'transcript_id is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Find the item by transcription_job_id
  const { data: item, error: findError } = await supabase
    .from('items')
    .select('id')
    .eq('transcription_job_id', transcript_id)
    .single()

  if (findError || !item) {
    // Not our transcript — return 200 to avoid AssemblyAI retrying
    return NextResponse.json({ ok: true })
  }

  if (status === 'error') {
    await supabase
      .from('items')
      .update({ status: 'failed', error_message: 'AssemblyAI transcription failed' })
      .eq('id', item.id)
    return NextResponse.json({ ok: true })
  }

  if (status !== 'completed') {
    // Still processing — acknowledge without doing anything
    return NextResponse.json({ ok: true })
  }

  try {
    const data = await processPodcastTranscript(transcript_id)
    await supabase
      .from('items')
      .update({ ...data, status: 'ready' })
      .eq('id', item.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await supabase
      .from('items')
      .update({ status: 'failed', error_message: message })
      .eq('id', item.id)
  }

  return NextResponse.json({ ok: true })
}
