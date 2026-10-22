import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_API_URL, getApiKey, getApiUrl, normalizeApiKey, normalizeApiUrl, setApiKey, setApiUrl } from './storage'

describe('normalizeApiUrl', () => {
  it.each([
    ['', DEFAULT_API_URL],
    ['   ', DEFAULT_API_URL],
    ['127.0.0.1:8000', 'http://127.0.0.1:8000'],
    ['localhost:8000/', 'http://localhost:8000'],
    ['http://127.0.0.1:8000/', 'http://127.0.0.1:8000'],
    [' https://api.example.com// ', 'https://api.example.com'],
    ['HTTP://127.0.0.1:8000', 'HTTP://127.0.0.1:8000'],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeApiUrl(input)).toBe(expected)
  })
})

describe('getApiUrl / setApiUrl', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to the local backend when nothing is saved', () => {
    expect(getApiUrl()).toBe(DEFAULT_API_URL)
  })

  it('stores the normalized URL', () => {
    setApiUrl('127.0.0.1:8000/')
    expect(getApiUrl()).toBe('http://127.0.0.1:8000')
  })
})

describe('normalizeApiKey', () => {
  it.each([
    ['abc-123', 'abc-123'],
    ['  abc-123  ', 'abc-123'],
    ['"abc-123"', 'abc-123'],
    ["'abc-123'", 'abc-123'],
    [' "abc-123" ', 'abc-123'],
    ['"abc-123', '"abc-123'],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeApiKey(input)).toBe(expected)
  })

  it('stores the key without quotes', () => {
    localStorage.clear()
    setApiKey('"abc-123"')
    expect(getApiKey()).toBe('abc-123')
  })
})
