import { describe, it, expect } from 'vitest'
import { detectSourceType } from '@/lib/pipeline/detect'

describe('detectSourceType', () => {
  describe('youtube', () => {
    it('detects youtube.com/watch', () => {
      expect(detectSourceType('https://www.youtube.com/watch?v=abc123')).toBe('youtube')
    })

    it('detects youtu.be short links', () => {
      expect(detectSourceType('https://youtu.be/abc123')).toBe('youtube')
    })

    it('detects youtube shorts', () => {
      expect(detectSourceType('https://www.youtube.com/shorts/abc123')).toBe('youtube')
    })

    it('detects youtube embeds', () => {
      expect(detectSourceType('https://www.youtube.com/embed/abc123')).toBe('youtube')
    })
  })

  describe('podcast', () => {
    it('detects direct mp3 URLs', () => {
      expect(detectSourceType('https://example.com/episode.mp3')).toBe('podcast')
    })

    it('detects m4a audio files', () => {
      expect(detectSourceType('https://example.com/episode.m4a')).toBe('podcast')
    })

    it('detects mp3 with query params', () => {
      expect(detectSourceType('https://cdn.example.com/ep.mp3?token=abc')).toBe('podcast')
    })

    it('detects feeds. subdomain', () => {
      expect(detectSourceType('https://feeds.example.com/podcast')).toBe('podcast')
    })

    it('detects rss. subdomain', () => {
      expect(detectSourceType('https://rss.example.com/show')).toBe('podcast')
    })

    it('detects Apple Podcasts', () => {
      expect(detectSourceType('https://podcasts.apple.com/us/podcast/id123')).toBe('podcast')
    })

    it('detects Spotify episodes', () => {
      expect(detectSourceType('https://open.spotify.com/episode/abc')).toBe('podcast')
    })

    it('detects Buzzsprout', () => {
      expect(detectSourceType('https://www.buzzsprout.com/123/456')).toBe('podcast')
    })

    it('detects Simplecast', () => {
      expect(detectSourceType('https://player.simplecast.com/abc')).toBe('podcast')
    })
  })

  describe('article', () => {
    it('classifies arbitrary web pages as articles', () => {
      expect(detectSourceType('https://example.com/blog/post')).toBe('article')
    })

    it('classifies news URLs as articles', () => {
      expect(detectSourceType('https://www.nytimes.com/2026/article.html')).toBe('article')
    })

    it('classifies Wikipedia as articles', () => {
      expect(detectSourceType('https://en.wikipedia.org/wiki/Rubber_duck_debugging')).toBe('article')
    })
  })
})
