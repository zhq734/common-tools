/** 用户作用域缓存键构建工具的类型声明 */
export const ANONYMOUS_USER_SCOPE_ID: string

/**
 * 构建按当前用户隔离的业务缓存键。
 * @param key 原始业务缓存键
 * @param user 当前用户对象或标识；不传时从本地认证缓存读取
 * @param storage 存储对象
 * @returns 带用户命名空间的缓存键
 * 创建者：zhenghq
 */
export function buildUserScopedStorageKey(key: string, user?: unknown, storage?: unknown): string
