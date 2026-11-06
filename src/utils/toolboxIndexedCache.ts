import { buildUserScopedStorageKey } from './user-scoped-storage.js'

const DB_NAME = 'toolbox-cache'
const STORE_NAME = 'entries'
const DB_VERSION = 1

type CacheRecord<T> = {
  key: string
  value: T
  updatedAt: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error || new Error('IndexedDB 打开失败'))
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
  })

  return dbPromise
}

export async function readToolboxIndexedCache<T>(key: string): Promise<T | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return null
  }

  const db = await openDb()
  const scopedKey = buildUserScopedStorageKey(key)
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(scopedKey)

    request.onerror = () => reject(request.error || new Error('IndexedDB 读取失败'))
    request.onsuccess = () => {
      const record = request.result as CacheRecord<T> | undefined
      resolve(record?.value ?? null)
    }
  })
}

export async function writeToolboxIndexedCache<T>(key: string, value: T): Promise<void> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return
  }

  const db = await openDb()
  const scopedKey = buildUserScopedStorageKey(key)
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.put({
      key: scopedKey,
      value,
      updatedAt: Date.now(),
    } satisfies CacheRecord<T>)

    request.onerror = () => reject(request.error || new Error('IndexedDB 写入失败'))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('IndexedDB 写入失败'))
  })
}

export async function removeToolboxIndexedCache(key: string): Promise<void> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return
  }

  const db = await openDb()
  const scopedKey = buildUserScopedStorageKey(key)
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.delete(scopedKey)

    request.onerror = () => reject(request.error || new Error('IndexedDB 删除失败'))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('IndexedDB 删除失败'))
  })
}
