/** 独立工具箱应用无登录态，保留本地认证缓存键常量仅用于命名空间兼容 */
const AUTH_USER_STORAGE_KEY = 'datahub.auth.user'

export const ANONYMOUS_USER_SCOPE_ID = 'anonymous'

/**
 * 获取浏览器 localStorage。
 *
 * @returns {Storage | null} localStorage，不可用时返回 null
 */
function browserStorage() {
  return typeof window === 'undefined' ? null : window.localStorage
}

/**
 * 将原始用户标识转换为可用于缓存键的稳定片段。
 *
 * @param {unknown} value 原始用户标识
 * @returns {string} 编码后的缓存命名空间片段
 */
function encodeScopeValue(value) {
  const text = String(value ?? '').trim()
  return text ? encodeURIComponent(text) : ANONYMOUS_USER_SCOPE_ID
}

/**
 * 归一化用户缓存命名空间标识。
 *
 * @param {unknown} user 当前用户对象或用户标识
 * @returns {string} 用户缓存命名空间标识
 */
export function normalizeUserScopeId(user) {
  if (user && typeof user === 'object') {
    return encodeScopeValue(user.id ?? user.username ?? user.email ?? user.account)
  }
  return encodeScopeValue(user)
}

/**
 * 从本地认证缓存中读取当前用户命名空间。
 *
 * @param {Storage | Map<string, string> | null} storage 存储对象
 * @returns {string} 用户缓存命名空间标识
 */
export function getStoredUserScopeId(storage = browserStorage()) {
  const raw = storage?.getItem?.(AUTH_USER_STORAGE_KEY)
  if (!raw) return ANONYMOUS_USER_SCOPE_ID
  try {
    return normalizeUserScopeId(JSON.parse(raw))
  } catch {
    return ANONYMOUS_USER_SCOPE_ID
  }
}

/**
 * 构建按当前用户隔离的业务缓存键。
 *
 * @param {string} key 原始业务缓存键
 * @param {unknown} user 当前用户对象或用户标识；不传时从认证缓存读取
 * @param {Storage | Map<string, string> | null} storage 存储对象
 * @returns {string} 按用户命名空间隔离后的缓存键
 */
export function buildUserScopedStorageKey(key, user = undefined, storage = browserStorage()) {
  const scopeId = user === undefined ? getStoredUserScopeId(storage) : normalizeUserScopeId(user)
  return `datahub:user:${scopeId}:${key}`
}
