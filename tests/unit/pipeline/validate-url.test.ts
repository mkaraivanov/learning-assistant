import { describe, it, expect } from 'vitest'
import { validateExternalUrl } from '@/lib/pipeline/validate-url'

describe('validateExternalUrl', () => {
  describe('valid URLs', () => {
    it('accepts https URLs', () => {
      const result = validateExternalUrl('https://example.com/article')
      expect(result).toBeInstanceOf(URL)
      expect(result.hostname).toBe('example.com')
    })

    it('accepts http URLs', () => {
      const result = validateExternalUrl('http://example.com/page')
      expect(result.protocol).toBe('http:')
    })

    it('returns a URL object', () => {
      expect(validateExternalUrl('https://example.com')).toBeInstanceOf(URL)
    })
  })

  describe('blocked protocols', () => {
    it('rejects ftp URLs', () => {
      expect(() => validateExternalUrl('ftp://example.com/file')).toThrow(
        'Only http and https URLs are supported'
      )
    })

    it('rejects file URLs', () => {
      expect(() => validateExternalUrl('file:///etc/passwd')).toThrow(
        'Only http and https URLs are supported'
      )
    })

    it('rejects javascript URLs', () => {
      expect(() => validateExternalUrl('javascript:alert(1)')).toThrow()
    })
  })

  describe('blocked private networks', () => {
    it('blocks localhost', () => {
      expect(() => validateExternalUrl('http://localhost:3000')).toThrow(
        'URLs pointing to private networks are not allowed'
      )
    })

    it('blocks 127.0.0.1', () => {
      expect(() => validateExternalUrl('http://127.0.0.1/admin')).toThrow(
        'URLs pointing to private networks are not allowed'
      )
    })

    it('blocks 10.x.x.x', () => {
      expect(() => validateExternalUrl('http://10.0.0.1/secret')).toThrow(
        'URLs pointing to private networks are not allowed'
      )
    })

    it('blocks 192.168.x.x', () => {
      expect(() => validateExternalUrl('http://192.168.1.1/')).toThrow(
        'URLs pointing to private networks are not allowed'
      )
    })

    it('blocks 172.16-31.x.x', () => {
      expect(() => validateExternalUrl('http://172.16.0.1/')).toThrow(
        'URLs pointing to private networks are not allowed'
      )
    })

    it('blocks 169.254 link-local', () => {
      expect(() => validateExternalUrl('http://169.254.1.1/')).toThrow(
        'URLs pointing to private networks are not allowed'
      )
    })

    it('blocks IPv6 loopback', () => {
      expect(() => validateExternalUrl('http://[::1]/')).toThrow(
        'URLs pointing to private networks are not allowed'
      )
    })
  })

  describe('invalid URLs', () => {
    it('throws on malformed URL', () => {
      expect(() => validateExternalUrl('not-a-url')).toThrow()
    })
  })
})
