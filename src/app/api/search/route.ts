import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEmbeddingProvider } from '@/lib/llm'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')

  if (!q || q.trim().length === 0) {
    return NextResponse.json({ error: 'q parameter is required' }, { status: 400 })
  }

  const embedder = getEmbeddingProvider()
  const queryEmbedding = await embedder.embed(q)

  const supabase = createAdminClient()

  // pgvector cosine similarity search using RPC
  const { data, error } = await supabase.rpc('search_items', {
    query_embedding: queryEmbedding,
    match_threshold: 0.5,
    match_count: 20,
  })

  if (error) {
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }

  return NextResponse.json({ items: data })
}
