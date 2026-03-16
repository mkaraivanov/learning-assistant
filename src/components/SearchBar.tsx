'use client'

import { useState, useCallback } from 'react'
import type { Item } from '@/types/item'

interface Props {
  onResults: (items: Item[]) => void
  onClear: () => void
}

export function SearchBar({ onResults, onClear }: Props) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      onClear()
      return
    }

    setSearching(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      onResults(data.items ?? [])
    } finally {
      setSearching(false)
    }
  }, [onResults, onClear])

  return (
    <div className="relative">
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          if (!e.target.value) onClear()
        }}
        onKeyDown={(e) => e.key === 'Enter' && search(query)}
        placeholder="Search your library..."
        className="w-full px-4 py-2 pl-9 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <span className="absolute left-3 top-2.5 text-gray-400 text-sm">🔍</span>
      {searching && (
        <span className="absolute right-3 top-2.5 text-gray-400 text-xs">...</span>
      )}
    </div>
  )
}
