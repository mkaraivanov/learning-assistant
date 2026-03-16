'use client'

interface Props {
  tags: string[]
  selected: string | null
  onSelect: (tag: string | null) => void
}

export function TagFilter({ tags, selected, onSelect }: Props) {
  if (tags.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onSelect(null)}
        className={`text-sm px-3 py-1 rounded-full border transition-colors ${
          !selected
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400'
        }`}
      >
        All
      </button>
      {tags.map((tag) => (
        <button
          key={tag}
          onClick={() => onSelect(tag === selected ? null : tag)}
          className={`text-sm px-3 py-1 rounded-full border transition-colors ${
            selected === tag
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400'
          }`}
        >
          {tag}
        </button>
      ))}
    </div>
  )
}
