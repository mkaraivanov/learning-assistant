'use client'

import { useState, useEffect, useCallback } from 'react'
import { ItemCard } from './ItemCard'
import { SearchBar } from './SearchBar'
import { TagFilter } from './TagFilter'
import type { Item } from '@/types/item'

export function ItemGrid() {
  const [items, setItems] = useState<Partial<Item>[]>([])
  const [searchResults, setSearchResults] = useState<Partial<Item>[] | null>(null)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [allTags, setAllTags] = useState<string[]>([])

  const fetchItems = useCallback(async (tag?: string | null) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (tag) params.set('tag', tag)
    const res = await fetch(`/api/items?${params}`)
    const data = await res.json()
    setItems(data.items ?? [])

    // Collect all unique tags
    const tags = new Set<string>()
    ;(data.items ?? []).forEach((item: Partial<Item>) => {
      item.tags?.forEach((t) => tags.add(t))
    })
    setAllTags(Array.from(tags).sort())
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchItems(selectedTag)

    // Only poll when items are actively processing — saves unnecessary requests
    const hasActiveItems = items.some(
      (i) => i.status === 'pending' || i.status === 'processing'
    )
    if (!hasActiveItems && items.length > 0) return

    const interval = setInterval(() => fetchItems(selectedTag), 5000)
    return () => clearInterval(interval)
  }, [fetchItems, selectedTag, items])

  const displayItems = searchResults ?? items

  return (
    <div className="space-y-4">
      <SearchBar
        onResults={(results) => setSearchResults(results)}
        onClear={() => setSearchResults(null)}
      />
      <TagFilter tags={allTags} selected={selectedTag} onSelect={setSelectedTag} />

      {loading && items.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 animate-pulse">
              <div className="aspect-video bg-gray-200 dark:bg-gray-600 rounded-lg mb-3" />
              <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded mb-2" />
              <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-4/5" />
            </div>
          ))}
        </div>
      ) : displayItems.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No items yet</p>
          <p className="text-sm mt-1">Add a URL above to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {displayItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item as Item}
            />
          ))}
        </div>
      )}
    </div>
  )
}
