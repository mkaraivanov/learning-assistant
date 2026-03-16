'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Item } from '@/types/item'

const STATUS_CONFIG: Record<string, { label: string; color: string; showProgress: boolean }> = {
  pending: { label: 'Queued', color: 'text-gray-500', showProgress: true },
  processing: { label: 'Processing...', color: 'text-yellow-600', showProgress: true },
  ready: { label: 'Ready', color: 'text-green-600', showProgress: false },
  failed: { label: 'Failed', color: 'text-red-600', showProgress: false },
}

export default function ItemDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [item, setItem] = useState<Item | null>(null)
  const [loading, setLoading] = useState(true)
  const [transcriptOpen, setTranscriptOpen] = useState(false)

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>

    async function fetchItem() {
      const res = await fetch(`/api/items/${id}`)
      if (res.status === 404) {
        router.push('/')
        return
      }
      const data = await res.json()
      setItem(data)
      setLoading(false)

      if (data.status === 'ready' || data.status === 'failed') {
        clearInterval(interval)
      }
    }

    fetchItem()
    interval = setInterval(fetchItem, 3000)

    return () => clearInterval(interval)
  }, [id, router])

  async function handleDelete() {
    if (!confirm('Delete this item?')) return
    await fetch(`/api/items/${id}`, { method: 'DELETE' })
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    )
  }

  if (!item) return null

  const statusCfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.pending
  const isProcessing = item.status === 'pending' || item.status === 'processing'

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Back link */}
        <Link href="/" className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-6 inline-block">
          ← Back to library
        </Link>

        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
          {item.thumbnail_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.thumbnail_url}
              alt=""
              className="w-full aspect-video object-cover rounded-lg mb-4"
            />
          )}

          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              {isProcessing ? (
                <div className="h-6 bg-gray-200 dark:bg-gray-600 rounded animate-pulse mb-2 w-3/4" />
              ) : (
                <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                  {item.title ?? item.source_url}
                </h1>
              )}

              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                <span className={`font-medium ${statusCfg.color}`}>{statusCfg.label}</span>
                {item.author && <span>{item.author}</span>}
                {item.channel && <span>{item.channel}</span>}
                {item.published_at && (
                  <span>{new Date(item.published_at).toLocaleDateString()}</span>
                )}
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Source ↗
                </a>
              </div>
            </div>

            <button
              onClick={handleDelete}
              className="text-gray-400 hover:text-red-500 transition-colors text-sm"
            >
              Delete
            </button>
          </div>

          {statusCfg.showProgress && (
            <div className="mt-4 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full animate-pulse w-2/3" />
            </div>
          )}

          {item.status === 'failed' && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-600 dark:text-red-400">
              {item.error_message ?? 'Processing failed'}
            </div>
          )}
        </div>

        {/* Summary */}
        {item.summary_short && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Summary</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
              {item.summary_short}
            </p>

            {item.summary_bullets && item.summary_bullets.length > 0 && (
              <ul className="space-y-2">
                {item.summary_bullets.map((bullet, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span className="text-blue-500 flex-shrink-0">•</span>
                    {bullet}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Tags */}
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Transcript (expandable) */}
        {item.raw_content && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <button
              onClick={() => setTranscriptOpen((o) => !o)}
              className="flex items-center justify-between w-full text-left"
            >
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">
                {item.source_type === 'article' ? 'Full Text' : 'Transcript'}
              </h2>
              <span className="text-gray-400">{transcriptOpen ? '▲' : '▼'}</span>
            </button>

            {transcriptOpen && (
              <div className="mt-4 text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
                {item.raw_content}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
