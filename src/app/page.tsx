import { UrlInput } from '@/components/UrlInput'
import { ItemGrid } from '@/components/ItemGrid'

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Learning Assistant
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Save articles, videos, and podcasts. Get AI summaries and search your knowledge.
          </p>
          <UrlInput />
        </div>

        <ItemGrid />
      </div>
    </main>
  )
}
