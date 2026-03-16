import { http, HttpResponse } from 'msw'

export const handlers = [
  // OpenAI embeddings
  http.post('https://api.openai.com/v1/embeddings', () => {
    return HttpResponse.json({
      data: [{ embedding: new Array(1536).fill(0.1), index: 0 }],
      model: 'text-embedding-3-small',
      usage: { prompt_tokens: 10, total_tokens: 10 },
    })
  }),

  // OpenAI chat completions
  http.post('https://api.openai.com/v1/chat/completions', () => {
    return HttpResponse.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              summary_short: 'Test summary.',
              summary_bullets: ['Point 1', 'Point 2'],
              tags: ['test', 'mock'],
            }),
            role: 'assistant',
          },
          finish_reason: 'stop',
          index: 0,
        },
      ],
      model: 'gpt-4o-mini',
    })
  }),

  // Anthropic messages
  http.post('https://api.anthropic.com/v1/messages', () => {
    return HttpResponse.json({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            summary_short: 'Test summary.',
            summary_bullets: ['Point 1', 'Point 2'],
            tags: ['test', 'mock'],
          }),
        },
      ],
      model: 'claude-sonnet-4-6',
      role: 'assistant',
    })
  }),

  // AssemblyAI transcript submit
  http.post('https://api.assemblyai.com/v2/transcript', () => {
    return HttpResponse.json({ id: 'test-transcript-id', status: 'queued' })
  }),

  // AssemblyAI transcript get
  http.get('https://api.assemblyai.com/v2/transcript/:id', () => {
    return HttpResponse.json({
      id: 'test-transcript-id',
      status: 'completed',
      text: 'This is a test transcript for a podcast episode.',
      audio_duration: 120,
    })
  }),

  // YouTube Data API
  http.get('https://www.googleapis.com/youtube/v3/videos', () => {
    return HttpResponse.json({
      items: [
        {
          snippet: {
            title: 'Test Video',
            channelTitle: 'Test Channel',
            description: 'A test video description.',
            publishedAt: '2024-01-01T00:00:00Z',
            thumbnails: { high: { url: 'https://example.com/thumb.jpg' } },
          },
          contentDetails: { duration: 'PT10M30S' },
        },
      ],
    })
  }),
]
