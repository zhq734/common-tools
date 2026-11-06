import { buildUserScopedStorageKey } from './user-scoped-storage.js'

export function readToolboxCache<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const raw = window.localStorage.getItem(buildUserScopedStorageKey(key))
    if (!raw) {
      return fallback
    }
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeToolboxCache<T>(key: string, value: T) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(buildUserScopedStorageKey(key), JSON.stringify(value))
  } catch {
    // ignore quota / serialization failures
  }
}

export function removeToolboxCache(key: string) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.removeItem(buildUserScopedStorageKey(key))
  } catch {
    // ignore
  }
}
