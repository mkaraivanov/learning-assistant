import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import type { ItemInsert } from '@/types/item'
import { summarizeContent, embedContent } from './summarize'

const MIN_CONTENT_LENGTH = 200

export async function processArticle(url: string): Promise<Partial<ItemInsert>> {
  // Fetch with browser-like user agent to avoid blocks
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`)
  }

  const html = await response.text()
  const dom = new JSDOM(html, { url })
  const reader = new Readability(dom.window.document)
  const article = reader.parse()

  if (!article || !article.textContent || article.textContent.length < MIN_CONTENT_LENGTH) {
    throw new Error(
      'Could not extract readable content. The page may require JavaScript, be behind a paywall, or have insufficient text.'
    )
  }

  const rawContent = article.textContent.trim()
  const summary = await summarizeContent(rawContent)
  const embedding = await embedContent(summary.summary_short + ' ' + summary.summary_bullets.join(' '))

  return {
    title: article.title ?? null,
    author: article.byline ?? null,
    raw_content: rawContent,
    summary_short: summary.summary_short,
    summary_bullets: summary.summary_bullets,
    tags: summary.tags,
    embedding,
  }
}
