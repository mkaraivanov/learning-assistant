import { NextRequest, NextResponse } from 'next/server'

export function requireAuth(request: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV === 'development') return null

  const apiKey = request.headers.get('x-api-key')
  if (apiKey === process.env.API_SECRET_KEY) return null

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
