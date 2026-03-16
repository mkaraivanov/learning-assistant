const BLOCKED_HOSTS = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[::1\])/

export function validateExternalUrl(url: string): URL {
  const parsed = new URL(url)

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http and https URLs are supported')
  }

  if (BLOCKED_HOSTS.test(parsed.hostname)) {
    throw new Error('URLs pointing to private networks are not allowed')
  }

  return parsed
}
