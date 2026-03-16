import Link from 'next/link'
import type { Item } from '@/types/item'

interface Props {
  item: Partial<Item> & { id: string; status: string; source_type: string; source_url: string }
}

const SOURCE_ICONS: Record<string, string> = {
  article: '📄',
  youtube: '▶️',
  podcast: '🎙️',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  processing: 'bg-yellow-100 text-yellow-700',
  ready: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
}

export function ItemCard({ item }: Props) {
  const isPending = item.status === 'pending' || item.status === 'processing'

  return (
    <Link href={`/items/${item.id}`}>
      <div className="group rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 hover:shadow-md transition-shadow cursor-pointer">
        {/* Thumbnail or placeholder */}
        <div className="aspect-video w-full bg-gray-100 dark:bg-gray-700 rounded-lg mb-3 overflow-hidden flex items-center justify-center">
          {item.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-4xl">{SOURCE_ICONS[item.source_type] ?? '🔗'}</span>
          )}
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[item.status] ?? ''}`}>
            {item.status}
          </span>
          <span className="text-xs text-gray-400 uppercase">{item.source_type}</span>
        </div>

        {/* Title */}
        {isPending ? (
          <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded animate-pulse mb-2" />
        ) : (
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 text-sm mb-1">
            {item.title ?? item.source_url}
          </h3>
        )}

        {/* Summary */}
        {isPending ? (
          <div className="space-y-1">
            <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
            <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded animate-pulse w-4/5" />
          </div>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{item.summary_short}</p>
        )}

        {/* Tags */}
        {item.tags && item.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}
