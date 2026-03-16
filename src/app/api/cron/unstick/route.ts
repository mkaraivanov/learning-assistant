import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createAdminClient()
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()

  const { data: stuck } = await supabase
    .from('items')
    .select('id')
    .in('status', ['pending', 'processing'])
    .lt('updated_at', tenMinutesAgo)

  if (stuck && stuck.length > 0) {
    await supabase
      .from('items')
      .update({ status: 'failed', error_message: 'Processing timed out' })
      .in('id', stuck.map((i) => i.id))

    logger.warn('Unstuck stale items', { count: stuck.length, ids: stuck.map((i) => i.id) })
  }

  return NextResponse.json({ unstuck: stuck?.length ?? 0 })
}
