const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

type RequestOptions = {
  method?: string
  body?: unknown
  headers?: Record<string, string>
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<{ status: number; data: T }> {
  const { method = 'GET', body, headers = {} } = options

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const data = res.status === 204 ? null : await res.json()
  return { status: res.status, data: data as T }
}
