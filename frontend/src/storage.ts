const API_URL_KEY = 'poContractMatch.apiUrl'
const API_KEY_KEY = 'poContractMatch.apiKey'

export const DEFAULT_API_URL = 'http://127.0.0.1:8000'

// Tolerates what people actually type: no scheme ("127.0.0.1:8000", which
// fetch would otherwise treat as a path on the frontend), a trailing slash,
// or nothing at all (the local backend).
export function normalizeApiUrl(value: string): string {
  const url = value.trim().replace(/\/+$/, '')
  if (!url) return DEFAULT_API_URL
  return /^https?:\/\//i.test(url) ? url : `http://${url}`
}

export function getApiUrl(): string {
  return normalizeApiUrl(localStorage.getItem(API_URL_KEY) ?? '')
}

export function setApiUrl(value: string): void {
  localStorage.setItem(API_URL_KEY, normalizeApiUrl(value))
}

// The dev server's fallback: API_KEY from the project's .env (see
// vite.config.ts). Empty in production builds.
export const ENV_API_KEY: string = __ENV_API_KEY__

// The key saved in Settings, without the .env fallback.
export function getSavedApiKey(): string {
  return localStorage.getItem(API_KEY_KEY) ?? ''
}

// The key to send: the one saved in Settings, or else the .env fallback.
export function getApiKey(): string {
  return getSavedApiKey() || ENV_API_KEY
}

// Strips whitespace and quotes copied along with the value from .env
// (API_KEY="..."), which would otherwise make the key wrong.
export function normalizeApiKey(value: string): string {
  return value.trim().replace(/^(['"])(.*)\1$/, '$2').trim()
}

export function setApiKey(value: string): void {
  localStorage.setItem(API_KEY_KEY, normalizeApiKey(value))
}
